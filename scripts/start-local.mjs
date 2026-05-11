#!/usr/bin/env node
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4174;
const host = "127.0.0.1";
const logPath = path.join(rootDir, ".codexscope-server.log");
const url = `http://${host}:${port}/index.html`;

if (await isListening(port)) {
  console.log(`codex看板已经在运行：${url}`);
  process.exit(0);
}

const out = fsSync.openSync(logPath, "a");
const child = spawn(process.execPath, ["scripts/serve-local.mjs", "--port", String(port)], {
  cwd: rootDir,
  detached: true,
  stdio: ["ignore", out, out],
});

child.unref();

const ok = await waitForStatus();
if (!ok) {
  console.log(`codex看板启动中，稍后打开：${url}`);
  console.log(`如果页面打不开，查看日志：${logPath}`);
  process.exit(0);
}

console.log(`codex看板已启动：${url}`);

async function isListening(targetPort) {
  try {
    const { stdout } = await execFileAsync("lsof", [`-tiTCP:${targetPort}`, "-sTCP:LISTEN"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function waitForStatus() {
  return new Promise((resolve) => {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      const req = http.get(`http://${host}:${port}/api/status`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => {
        if (attempts >= 20) {
          resolve(false);
          return;
        }
        setTimeout(tick, 200);
      });
      req.setTimeout(500, () => {
        req.destroy();
      });
    };
    tick();
  });
}
