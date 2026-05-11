#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const args = parseArgs(process.argv.slice(2));
const root = args.root || path.join(os.homedir(), ".codex", "sessions");
const out = args.out || "data.js";
const days = Number(args.days || 0);
const trendMinutes = Number(args["trend-minutes"] || 300);
const cutoff = days > 0 ? Date.now() - days * DAY_MS : 0;

if (args.help || args.h) {
  console.log(`Usage: node scripts/generate-codex-data.mjs [--root DIR] [--out data.js] [--days 30] [--trend-minutes 300]`);
  process.exit(0);
}

if (!fs.existsSync(root)) {
  console.error(`Codex sessions directory not found: ${root}`);
  process.exit(1);
}

const files = collectSessionFiles(root, cutoff);
const parsedFiles = [];
for (const file of files) {
  parsedFiles.push(await parseSessionFile(file, cutoff));
}

const payload = buildPayload(parsedFiles, days, trendMinutes);
const body = JSON.stringify(payload);
fs.writeFileSync(
  out,
  `window.CODEXSCOPE_DATA = ${body};\nwindow.QUOTASCOPE_DATA = window.CODEXSCOPE_DATA;\n`,
  "utf8",
);

console.log(`wrote ${out} (${payload.summary.requestsLabel} requests, ${payload.summary.totalTokensLabel} tokens)`);

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

function collectSessionFiles(dir, cutoffMs) {
  const output = [];
  const slack = cutoffMs ? cutoffMs - DAY_MS : 0;
  const walk = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const stat = fs.statSync(full);
        if (!slack || stat.mtimeMs >= slack) output.push(full);
      }
    }
  };
  walk(dir);
  return output.sort();
}

async function parseSessionFile(file, cutoffMs) {
  const parsed = {
    sid: path.basename(file, path.extname(file)),
    file,
    cwd: "",
    model: "unknown",
    usageEvents: [],
    completionEvents: [],
    failureEvents: [],
    latestLimits: null,
    latestLimitsTs: 0,
  };

  let previousTotal = null;
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const topType = obj?.type;
    const payload = obj?.payload || {};
    const payloadType = payload?.type;
    const ts = parseTime(obj?.timestamp);

    if (topType === "session_meta") {
      if (payload.id) parsed.sid = String(payload.id);
      if (payload.cwd) parsed.cwd = String(payload.cwd);
      continue;
    }

    if (topType === "turn_context") {
      if (payload.model) parsed.model = String(payload.model);
      if (payload.cwd) parsed.cwd = String(payload.cwd);
      continue;
    }

    if (payloadType === "token_count") {
      if (payload.rate_limits && typeof payload.rate_limits === "object") {
        if (preferRateLimits(payload.rate_limits, ts, parsed.latestLimits, parsed.latestLimitsTs)) {
          parsed.latestLimits = payload.rate_limits;
          parsed.latestLimitsTs = ts || 0;
        }
      }

      const lastUsage = usageSnapshot(payload.info?.last_token_usage);
      const totalUsage = usageSnapshot(payload.info?.total_token_usage);
      const hadPrevious = previousTotal !== null;
      const previous = previousTotal;
      if (totalUsage) previousTotal = totalUsage;

      if (ts && ts >= cutoffMs) {
        let usage = null;
        if (totalUsage && hadPrevious) {
          usage = usageDelta(totalUsage, previous);
        } else if (lastUsage) {
          usage = lastUsage;
        }
        if (usage && hasUsage(usage)) {
          parsed.usageEvents.push({
            ts,
            sid: parsed.sid,
            model: parsed.model || "unknown",
            usage,
            snapshot: totalUsage,
          });
        }
      }
      continue;
    }

    if (payloadType === "task_complete" && ts && ts >= cutoffMs) {
      parsed.completionEvents.push({
        ts,
        sid: parsed.sid,
        model: parsed.model || "unknown",
        durationMs: number(payload.duration_ms),
        ttfbMs: number(payload.time_to_first_token_ms),
      });
      continue;
    }

    if ((payloadType === "error" || payloadType === "turn_aborted") && ts && ts >= cutoffMs) {
      parsed.failureEvents.push({ ts, sid: parsed.sid, model: parsed.model || "unknown" });
    }
  }

  return parsed;
}

function parseTime(value) {
  if (!value) return 0;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : 0;
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function usageSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  const usage = {
    input: number(value.input_tokens),
    cached: number(value.cached_input_tokens),
    output: number(value.output_tokens),
    reasoning: number(value.reasoning_output_tokens),
    total: number(value.total_tokens),
  };
  return Object.values(usage).some(Boolean) ? usage : null;
}

function usageDelta(current, previous) {
  return {
    input: Math.max(0, current.input - previous.input),
    cached: Math.max(0, current.cached - previous.cached),
    output: Math.max(0, current.output - previous.output),
    reasoning: Math.max(0, current.reasoning - previous.reasoning),
    total: Math.max(0, current.total - previous.total),
  };
}

function addUsage(target, source) {
  target.input += source.input || 0;
  target.cached += source.cached || 0;
  target.output += source.output || 0;
  target.reasoning += source.reasoning || 0;
  target.total += source.total || 0;
  return target;
}

function hasUsage(usage) {
  return usage.input || usage.cached || usage.output || usage.reasoning || usage.total;
}

function preferRateLimits(candidate, candidateTs, current, currentTs) {
  if (!candidate) return false;
  if (!current) return true;
  const candidatePriority = rateLimitPriority(candidate);
  const currentPriority = rateLimitPriority(current);
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority;
  if (!currentTs) return true;
  if (!candidateTs) return false;
  return candidateTs >= currentTs;
}

function rateLimitPriority(limits) {
  const limitId = String(limits?.limit_id || "").trim().toLowerCase();
  const limitName = String(limits?.limit_name || "").trim();
  if (limitId === "codex") return 100;
  if (limitId && !limitName) return 80;
  if (limitId || limitName) return 50;
  return 10;
}

function buildPayload(parsedFiles, windowDays, minutes) {
  const loaded = normalize(parsedFiles);
  loaded.events.sort((a, b) => a.ts - b.ts);
  loaded.ttfbEvents.sort((a, b) => a.ts - b.ts);
  loaded.failureEvents.sort((a, b) => a.ts - b.ts);

  const totals = emptyUsage();
  for (const event of loaded.events) addUsage(totals, event.usage);

  const byModel = new Map();
  for (const session of loaded.sessions) {
    const model = session.model || "unknown";
    const row = byModel.get(model) || { tokens: 0, requests: 0, ttfbMs: 0, ttfbCount: 0 };
    row.tokens += session.usage.total;
    row.requests += session.calls;
    row.ttfbMs += session.ttfbMs;
    row.ttfbCount += session.ttfbCount;
    byModel.set(model, row);
  }

  const sessionRows = loaded.sessions
    .slice()
    .sort((a, b) => b.usage.total - a.usage.total)
    .slice(0, 20)
    .map((session, index) => ({
      rank: index + 1,
      name: projectName(session.cwd, `session ${tail(session.sid, 6)}`),
      model: session.model || "unknown",
      tokens: session.usage.total,
      tokensLabel: fmtInt(session.usage.total),
      requests: session.calls,
      duration: fmtDuration(session.durationMs),
      status: session.failures === 0 ? "ok" : "warn",
    }));
  const maxSessionTokens = Math.max(1, ...sessionRows.map((row) => row.tokens));
  for (const row of sessionRows) row.percent = Math.round((row.tokens / maxSessionTokens) * 100);

  const modelRows = Array.from(byModel.entries())
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 12)
    .map(([name, row]) => {
      const latency = row.ttfbCount > 0 ? row.ttfbMs / row.ttfbCount / 1000 : 0;
      return {
        name,
        tokens: row.tokens,
        tokensLabel: fmtInt(row.tokens),
        requests: row.requests,
        latency,
        latencyLabel: row.ttfbCount > 0 ? `${latency.toFixed(2)}s` : "--",
      };
    });
  const maxModelTokens = Math.max(1, ...modelRows.map((row) => row.tokens));
  for (const row of modelRows) row.percent = Math.round((row.tokens / maxModelTokens) * 100);

  const calls = loaded.sessions.reduce((sum, session) => sum + session.calls, 0);
  const failures = loaded.sessions.reduce((sum, session) => sum + session.failures, 0);
  const successRate = calls > 0 ? clamp(((calls - failures) / calls) * 100) : 100;
  const failureRate = calls > 0 ? clamp((failures / calls) * 100) : 0;
  const cacheHit = totals.input > 0 ? clamp((totals.cached / totals.input) * 100) : 0;
  const { peakTotal, peakTs } = peakRate(loaded.events);
  const limits = loaded.limits || {};
  const primary = mapValue(limits, "primary");
  const secondary = mapValue(limits, "secondary");
  const primaryUsed = safePercent(primary.used_percent);
  const secondaryUsed = safePercent(secondary.used_percent);
  const sessionCatalog = {};

  for (const session of loaded.sessions) {
    sessionCatalog[session.sid] = {
      name: projectName(session.cwd, `session ${tail(session.sid, 6)}`),
      model: session.model || "unknown",
    };
  }
  for (const event of loaded.events) {
    if (!sessionCatalog[event.sid]) {
      sessionCatalog[event.sid] = { name: `session ${tail(event.sid, 6)}`, model: event.model || "unknown" };
    }
  }

  const records = loaded.events.map((event) => [
    event.ts,
    event.sid,
    event.model || "unknown",
    event.usage.input,
    event.usage.cached,
    event.usage.output,
    event.usage.reasoning,
    event.usage.total,
  ]);
  const ttfbRecords = loaded.ttfbEvents.map((event) => [event.ts, event.sid, event.model || "unknown", event.ttfbMs]);
  const failureRecords = loaded.failureEvents.map((event) => [event.ts, event.sid, event.model || "unknown"]);
  const availableStart = records.length ? records[0][0] : Date.now();
  const availableEnd = records.length ? records[records.length - 1][0] : Date.now();

  return {
    generatedAt: formatLocalDateTime(Date.now()),
    windowDays,
    availableRange: { start: availableStart, end: availableEnd },
    sessionsCatalog: sessionCatalog,
    records,
    ttfbRecords,
    failureRecords,
    summary: {
      totalTokens: totals.total,
      totalTokensLabel: fmtInt(totals.total),
      inputTokens: totals.input,
      inputLabel: fmtInt(totals.input),
      cachedTokens: totals.cached,
      cachedLabel: fmtInt(totals.cached),
      outputTokens: totals.output,
      outputLabel: fmtInt(totals.output),
      reasoningTokens: totals.reasoning,
      reasoningLabel: fmtInt(totals.reasoning),
      requests: calls,
      requestsLabel: comma(calls),
      failures,
      successRate,
      successRateLabel: `${successRate.toFixed(1)}%`,
      cacheHit,
      cacheHitLabel: `${cacheHit.toFixed(1)}%`,
      peakTokens: peakTotal,
      peakLabel: fmtInt(peakTotal),
      peakTime: peakTs ? displayTime(peakTs) : "--",
      peakTpmLabel: `${fmtInt(peakTotal)} TPM`,
    },
    limits: {
      limitId: stringValue(limits, "limit_id"),
      limitName: stringValue(limits, "limit_name"),
      planType: stringValue(limits, "plan_type") || "unknown",
      primaryUsed,
      primaryRemaining: primaryUsed == null ? null : 100 - primaryUsed,
      primaryReset: displayReset(primary.resets_at),
      primaryWindowMinutes: primary.window_minutes,
      secondaryUsed,
      secondaryRemaining: secondaryUsed == null ? null : 100 - secondaryUsed,
      secondaryReset: displayReset(secondary.resets_at),
      secondaryWindowMinutes: secondary.window_minutes,
      rateLimitReachedType: limits.rate_limit_reached_type ?? null,
    },
    trend: bucketEvents(loaded.events, Date.now(), minutes),
    sessions: sessionRows,
    models: modelRows,
    risk: [
      { name: "5h", value: primaryUsed || 0, label: `${Math.round(primaryUsed || 0)}% used`, limit: "Codex primary" },
      { name: "Week", value: secondaryUsed || 0, label: `${Math.round(secondaryUsed || 0)}% used`, limit: "Codex secondary" },
      { name: "Cache", value: cacheHit, label: `${Math.round(cacheHit)}% hit`, limit: "local logs" },
      { name: "Fail", value: failureRate, label: `${failures} (${failureRate.toFixed(1)}%)`, limit: "errors" },
    ],
    coverage: [
      { metric: "真实额度", source: "token_count.rate_limits", status: loaded.limits ? "ok" : "missing" },
      { metric: "Token 消耗", source: "token_count.last_token_usage", status: loaded.events.length ? "ok" : "missing" },
      { metric: "会话排行", source: "session_meta + token_count", status: loaded.sessions.length ? "ok" : "missing" },
      { metric: "模型排行", source: "turn_context.model", status: modelRows.length ? "ok" : "missing" },
      { metric: "峰值速率", source: "selected range buckets", status: loaded.events.length ? "ok" : "missing" },
      { metric: "缓存命中", source: "cached_input_tokens / input_tokens", status: totals.input > 0 ? "ok" : "missing" },
    ],
  };
}

function normalize(parsedFiles) {
  const loaded = {
    sessions: [],
    events: [],
    ttfbEvents: [],
    failureEvents: [],
    limits: null,
    limitsTs: 0,
  };
  const seenSnapshots = new Set();

  for (const parsed of parsedFiles) {
    const stat = {
      sid: parsed.sid || path.basename(parsed.file, path.extname(parsed.file)),
      file: parsed.file,
      cwd: parsed.cwd || "",
      model: parsed.model || "unknown",
      startedAt: 0,
      endedAt: 0,
      durationMs: 0,
      ttfbMs: 0,
      ttfbCount: 0,
      calls: 0,
      completions: 0,
      failures: 0,
      usage: emptyUsage(),
    };

    for (const event of parsed.usageEvents) {
      const sid = event.sid || stat.sid;
      const model = event.model || stat.model || "unknown";
      if (event.snapshot) {
        const key = [sid, model, event.snapshot.input, event.snapshot.cached, event.snapshot.output, event.snapshot.reasoning, event.snapshot.total].join("\u0000");
        if (seenSnapshots.has(key)) continue;
        seenSnapshots.add(key);
      }
      markSeen(stat, event.ts);
      addUsage(stat.usage, event.usage);
      stat.calls += 1;
      loaded.events.push({ ts: event.ts, sid, model, usage: event.usage });
    }

    for (const event of parsed.completionEvents) {
      markSeen(stat, event.ts);
      stat.completions += 1;
      stat.durationMs += event.durationMs || 0;
      if (event.ttfbMs > 0) {
        stat.ttfbMs += event.ttfbMs;
        stat.ttfbCount += 1;
        loaded.ttfbEvents.push({
          ts: event.ts,
          sid: event.sid || stat.sid,
          model: event.model || stat.model || "unknown",
          ttfbMs: event.ttfbMs,
        });
      }
    }

    for (const event of parsed.failureEvents) {
      markSeen(stat, event.ts);
      stat.failures += 1;
      loaded.failureEvents.push({
        ts: event.ts,
        sid: event.sid || stat.sid,
        model: event.model || stat.model || "unknown",
      });
    }

    if (parsed.latestLimits && preferRateLimits(parsed.latestLimits, parsed.latestLimitsTs, loaded.limits, loaded.limitsTs)) {
      loaded.limits = parsed.latestLimits;
      loaded.limitsTs = parsed.latestLimitsTs || 0;
    }

    if (stat.calls || stat.completions || stat.failures) loaded.sessions.push(stat);
  }
  return loaded;
}

function emptyUsage() {
  return { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
}

function markSeen(stat, ts) {
  if (!stat.startedAt || ts < stat.startedAt) stat.startedAt = ts;
  if (!stat.endedAt || ts > stat.endedAt) stat.endedAt = ts;
}

function peakRate(events) {
  let left = 0;
  let total = 0;
  let peakTotal = 0;
  let peakTs = 0;
  for (let right = 0; right < events.length; right += 1) {
    total += events[right].usage.total || 0;
    while (left <= right && events[right].ts - events[left].ts >= MINUTE_MS) {
      total -= events[left].usage.total || 0;
      left += 1;
    }
    if (total > peakTotal) {
      peakTotal = total;
      peakTs = events[right].ts;
    }
  }
  return { peakTotal, peakTs };
}

function bucketEvents(events, now, minutes) {
  const bucketCount = 11;
  const end = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const start = end - minutes * MINUTE_MS;
  const step = (minutes * MINUTE_MS) / (bucketCount - 1);
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: start + Math.round(index * step),
    end: index === bucketCount - 1 ? end + 1000 : start + Math.round((index + 1) * step),
    usage: emptyUsage(),
  }));

  for (const event of events) {
    if (event.ts < start || event.ts > end) continue;
    const index = Math.max(0, Math.min(bucketCount - 1, Math.floor((event.ts - start) / step)));
    addUsage(buckets[index].usage, event.usage);
  }

  return buckets.map((bucket) => ({
    label: displayTime(bucket.start),
    input: bucket.usage.input,
    cached: bucket.usage.cached,
    output: bucket.usage.output,
    reasoning: bucket.usage.reasoning,
    total: bucket.usage.total,
  }));
}

function projectName(cwd, fallback) {
  if (!cwd) return fallback;
  const name = path.basename(cwd);
  return name && name !== "." && name !== path.sep ? name : fallback;
}

function fmtInt(value) {
  const raw = Number(value) || 0;
  const abs = Math.abs(raw);
  if (abs >= 1_000_000_000) return `${(raw / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(raw / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${Math.round(raw / 1_000)}K`;
  return `${Math.round(raw)}`;
}

function fmtDuration(ms) {
  if (!ms) return "未知";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function formatLocalDateTime(ts) {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function displayTime(ts) {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function displayReset(value) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "--";
  return displayTime(ts * 1000);
}

function safePercent(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return clamp(raw);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function mapValue(value, key) {
  const nested = value?.[key];
  return nested && typeof nested === "object" ? nested : {};
}

function stringValue(value, key) {
  return typeof value?.[key] === "string" ? value[key] : "";
}

function tail(value, count) {
  const text = String(value || "");
  return text.length <= count ? text : text.slice(-count);
}

function comma(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}
