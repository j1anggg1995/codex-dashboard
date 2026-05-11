#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const args = parseArgs(process.argv.slice(2));
const host = args.host || "127.0.0.1";
const preferredPort = Number(args.port || 4174);
const refreshMs = Math.max(10_000, Number(args["refresh-ms"] || 60_000));
const generatorPath = path.join(rootDir, "scripts", "generate-codex-data.mjs");
const pidPath = path.join(rootDir, ".codexscope-server.pid");

let lastRunAt = "";
let lastRunOk = false;
let lastRunError = "";
let nextRunAt = "";
let running = false;

await refreshData("startup");
scheduleRefresh();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${host}`);
    if (requestUrl.pathname === "/api/status") {
      await sendJson(res, {
        generatedAt: readGeneratedAt(),
        lastRunAt,
        lastRunOk,
        lastRunError,
        nextRunAt,
        refreshMs,
        running,
      });
      return;
    }

    if (requestUrl.pathname === "/api/refresh") {
      if (req.method !== "POST") {
        sendText(res, 405, "Method Not Allowed");
        return;
      }
      refreshData("manual").catch(() => {});
      await sendJson(res, { accepted: true, running: true });
      return;
    }

    const filePath = resolveStaticPath(requestUrl.pathname);
    if (!filePath) {
      sendText(res, 404, "Not Found");
      return;
    }

    const body = await fs.readFile(filePath);
    const headers = {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    };
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendText(res, 404, "Not Found");
      return;
    }
    sendText(res, 500, "Internal Server Error");
  }
});

const port = await listenWithFallback(server, preferredPort, host);
await writePidFile();
console.log(`codex看板 local service: http://${host}:${port}/index.html`);
console.log(`Data refresh interval: ${Math.round(refreshMs / 1000)}s`);

process.on("exit", cleanupPidFile);
process.on("SIGINT", () => {
  cleanupPidFile();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupPidFile();
  process.exit(0);
});

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      result[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      result[body] = argv[i + 1];
      i += 1;
    } else {
      result[body] = true;
    }
  }
  return result;
}

async function refreshData(reason) {
  if (running) return;
  running = true;
  lastRunError = "";
  const started = new Date();
  try {
    await runNode([generatorPath], rootDir);
    lastRunOk = true;
  } catch (error) {
    lastRunOk = false;
    lastRunError = cleanError(error);
    console.error(`[codex-dashboard] refresh failed (${reason}): ${lastRunError}`);
  } finally {
    lastRunAt = formatLocalDateTime(started);
    running = false;
  }
}

function scheduleRefresh() {
  const tick = () => {
    const next = new Date(Date.now() + refreshMs);
    nextRunAt = formatLocalDateTime(next);
    setTimeout(async () => {
      await refreshData("interval");
      tick();
    }, refreshMs);
  };
  tick();
}

function runNode(commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        const text = stdout.trim();
        if (text) console.log(`[codex-dashboard] ${text}`);
        resolve();
      } else {
        reject(new Error((stderr || stdout || `generator exited with ${code}`).trim()));
      }
    });
  });
}

function resolveStaticPath(pathname) {
  const normalized = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  if (normalized.includes("\0")) return null;
  const filePath = path.resolve(rootDir, `.${normalized}`);
  if (!filePath.startsWith(`${rootDir}${path.sep}`) && filePath !== rootDir) return null;
  if (!fsSync.existsSync(filePath) || fsSync.statSync(filePath).isDirectory()) return null;
  return filePath;
}

function listenWithFallback(serverInstance, startPort, bindHost) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const onError = (error) => {
        serverInstance.off("listening", onListening);
        if (error.code === "EADDRINUSE" && port < startPort + 20) {
          tryPort(port + 1);
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        serverInstance.off("error", onError);
        resolve(port);
      };
      serverInstance.once("error", onError);
      serverInstance.once("listening", onListening);
      serverInstance.listen(port, bindHost);
    };
    tryPort(startPort);
  });
}

async function sendJson(res, payload) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function readGeneratedAt() {
  try {
    const text = fsSync.readFileSync(path.join(rootDir, "data.js"), "utf8");
    const match = text.match(/"generatedAt":"([^"]+)"/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function formatLocalDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function cleanError(error) {
  return String(error?.message || error || "unknown error").split("\n").slice(0, 3).join(" ");
}

async function writePidFile() {
  await fs.writeFile(pidPath, `${process.pid}\n`, "utf8");
}

function cleanupPidFile() {
  try {
    const current = fsSync.readFileSync(pidPath, "utf8").trim();
    if (current === String(process.pid)) fsSync.rmSync(pidPath, { force: true });
  } catch {
    // Nothing to clean up.
  }
}
