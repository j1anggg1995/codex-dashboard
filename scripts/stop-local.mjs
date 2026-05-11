#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pidPath = path.join(rootDir, ".codexscope-server.pid");
const pids = new Set();

try {
  const pid = (await fs.readFile(pidPath, "utf8")).trim();
  if (pid) pids.add(pid);
} catch {
  // No pid file means the service may already be stopped.
}

try {
  const { stdout } = await execFileAsync("lsof", ["-tiTCP:4174", "-sTCP:LISTEN"]);
  stdout.split(/\s+/).filter(Boolean).forEach((pid) => pids.add(pid));
} catch {
  // lsof exits non-zero when no process is listening.
}

if (!pids.size) {
  console.log("codex看板本地服务未运行。");
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`已停止 codex看板本地服务 PID ${pid}`);
  } catch (error) {
    console.log(`无法停止 PID ${pid}: ${error?.message || error}`);
  }
}

await fs.rm(pidPath, { force: true });
