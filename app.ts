interface Window {
  CODEXSCOPE_DATA?: any;
  QUOTASCOPE_DATA?: any;
  CODEXSCOPE_SAMPLE_DATA?: any;
}

(() => {
  const data = window.CODEXSCOPE_DATA || window.QUOTASCOPE_DATA || window.CODEXSCOPE_SAMPLE_DATA;
  if (!data) return;
  const uiState = {
    sessionsExpanded: false,
    modelsExpanded: false,
    sessionMode: "tokens",
    distributionMode: "calls",
    currency: "USD",
    trendMode: "cumulative",
    trendScale: "linear",
    privacyMode: false,
    costVisible: true,
    fxEnabled: true,
    trendSeries: {
      total: true,
      cached: true,
      output: true,
      input: true,
      reasoning: true,
    },
  };

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
  const pct = (value) => `${clamp(value).toFixed(0)}%`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[ch]);

  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  const DAY = 24 * 60 * 60 * 1000;
  const RATE_WINDOW_MS = 60 * 1000;
  const recordTime = (row) => Number(row?.[0]) || 0;
  const sortByTime = (rows) => Array.isArray(rows)
    ? [...rows].sort((a, b) => recordTime(a) - recordTime(b))
    : [];
  const records = sortByTime(data.records);
  const ttfbRecords = sortByTime(data.ttfbRecords);
  const failureRecords = sortByTime(data.failureRecords);
  const sessionsCatalog = data.sessionsCatalog || {};
  const limits = data.limits || {};
  let summary = data.summary || {};
  let trendRows = data.trend || [];
  let distributionRows = [];
  let sessionRows = data.sessions || [];
  let modelRows = data.models || [];
  let projectRows = [];
  let costModelRows = [];
  let riskRows = data.risk || [];
  let costSummary = {};
  let decisionSummary: any = {};
  let performanceSummary: any = {};
  const fxState = {
    usdCny: 6.8012,
    date: "2026-05-08",
    source: "ECB 参考汇率",
    status: "fallback",
  };
  const EXCHANGE_RATE_URL = "https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ECB";
  const latestDataTime = Math.max(
    Number((data.availableRange || {}).end) || 0,
    recordTime(records[records.length - 1]),
  ) || Date.now();
  const earliestDataTime = Math.min(
    Number((data.availableRange || {}).start) || Infinity,
    recordTime(records[0]) || Infinity,
    recordTime(ttfbRecords[0]) || Infinity,
    recordTime(failureRecords[0]) || Infinity,
  );
  const firstDataTime = Number.isFinite(earliestDataTime) ? earliestDataTime : latestDataTime;
  const rangeNow = () => Math.min(Date.now(), latestDataTime);
  const lowerBound = (rows, ts) => {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (recordTime(rows[mid]) < ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const upperBound = (rows, ts) => {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (recordTime(rows[mid]) <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const rowsInRange = (rows, range) => rows.slice(lowerBound(rows, range.start), upperBound(rows, range.end));

  const localDayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ymd = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const parseYmdStart = (value) => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).getTime();
  };
  const formatBucketLabel = (ts, multiDay) => {
    const date = new Date(ts);
    if (multiDay) return `${date.getMonth() + 1}/${date.getDate()}`;
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };
  const formatPeakLabel = (ts, range) => {
    if (!Number.isFinite(ts)) return "--";
    const date = new Date(ts);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return range.end - range.start > DAY ? `${date.getMonth() + 1}/${date.getDate()} ${time}` : time;
  };
  const formatRangeLabel = (start, end, preset) => {
    if (preset === "24h") return "最近24小时";
    if (preset === "today") return "今天";
    if (preset === "7") return "7天内";
    if (preset === "30") return "30天内";
    if (preset === "history") return "历史总览";
    return `${ymd(new Date(start))} 至 ${ymd(new Date(end - 1))}`;
  };
  const fmt = (value) => {
    value = Number(value) || 0;
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)}K`;
    return `${Math.round(value)}`;
  };
  const fmtMs = (value) => {
    const ms = Number(value) || 0;
    if (ms <= 0) return "--";
    if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
    return `${Math.round(ms)}ms`;
  };
  const fmtRate = (value) => {
    const rate = Number(value) || 0;
    if (rate >= 1000) return `${(rate / 1000).toFixed(1)}K/s`;
    if (rate >= 100) return `${rate.toFixed(0)}/s`;
    if (rate >= 10) return `${rate.toFixed(1)}/s`;
    return `${rate.toFixed(2)}/s`;
  };
  const fmtDuration = (value) => {
    const ms = Math.max(0, Number(value) || 0);
    const minutes = ms / 60000;
    if (minutes >= 60) return `${(minutes / 60).toFixed(1)} 小时`;
    if (minutes >= 1) return `${minutes.toFixed(minutes >= 10 ? 0 : 1)} 分钟`;
    return `${Math.max(1, Math.round(ms / 1000))} 秒`;
  };
  const convertCost = (value) => {
    const amount = Number(value) || 0;
    return uiState.currency === "CNY" ? amount * fxState.usdCny : amount;
  };
  const money = (value) => {
    const amount = convertCost(value);
    if (uiState.currency === "CNY") {
      if (Math.abs(amount) >= 1000) return `¥${Math.round(amount).toLocaleString()}`;
      return `¥${amount.toFixed(2)}`;
    }
    if (Math.abs(amount) >= 1000) return `$${Math.round(amount).toLocaleString()}`;
    return `$${amount.toFixed(2)}`;
  };
  const moneyCompact = (value) => {
    const amount = convertCost(value);
    if (uiState.currency === "CNY") {
      if (Math.abs(amount) >= 1000) return `¥${Math.round(amount).toLocaleString()}`;
      if (Math.abs(amount) >= 100) return `¥${amount.toFixed(0)}`;
      return `¥${amount.toFixed(2)}`;
    }
    if (Math.abs(amount) >= 1000) return `$${Math.round(amount).toLocaleString()}`;
    if (Math.abs(amount) >= 100) return `$${amount.toFixed(0)}`;
    return `$${amount.toFixed(2)}`;
  };
  const MODEL_PRICING_USD_PER_M = [
    // Built-in USD prices per 1M tokens. Keep this table in sync with the
    // visible price help popover and OpenAI's public pricing page.
    { test: /gpt-5\.5/i, input: 5.00, cached: 0.50, output: 30.00 },
    { test: /gpt-5\.4[-_ ]?mini/i, input: 0.75, cached: 0.075, output: 4.50 },
    { test: /gpt-5\.4/i, input: 2.50, cached: 0.25, output: 15.00 },
    { test: /gpt-5\.3[-_ ]?codex[-_ ]?spark/i, input: 1.75, cached: 0.175, output: 14.00 },
    { test: /gpt-5\.3[-_ ]?codex/i, input: 1.75, cached: 0.175, output: 14.00 },
    { test: /gpt-5\.2[-_ ]?codex/i, input: 1.75, cached: 0.175, output: 14.00 },
    { test: /gpt-5\.1[-_ ]?codex|gpt-5[-_ ]?codex|gpt-5(?!\.\d)/i, input: 1.25, cached: 0.125, output: 10.00 },
  ];
  const pricingCache = new Map();
  const recordCostCache = new WeakMap();
  const pricingForModel = (model) => {
    const key = String(model || "");
    if (!pricingCache.has(key)) {
      pricingCache.set(key, MODEL_PRICING_USD_PER_M.find((item) => item.test.test(key)) || null);
    }
    return pricingCache.get(key);
  };
  const emptyCost = () => ({ input: 0, cached: 0, output: 0, reasoning: 0, total: 0, pricedTokens: 0, unpricedTokens: 0 });
  const addCost = (target, source) => {
    target.input += source.input || 0;
    target.cached += source.cached || 0;
    target.output += source.output || 0;
    target.reasoning += source.reasoning || 0;
    target.total += source.total || 0;
    target.pricedTokens += source.pricedTokens || 0;
    target.unpricedTokens += source.unpricedTokens || 0;
    return target;
  };
  const priceRecord = (record) => {
    const cachedCost = recordCostCache.get(record);
    if (cachedCost) return cachedCost;
    // Record layout is generated by generate_codex_data.go:
    // [ts, sid, model, input, cached_input, output, reasoning_output, total].
    const model = record[2] || "unknown";
    const pricing = pricingForModel(model);
    const inputTokens = Math.max(0, Number(record[3]) || 0);
    const cachedRaw = Math.max(0, Number(record[4]) || 0);
    const outputTokens = Math.max(0, Number(record[5]) || 0);
    const reasoningRaw = Math.max(0, Number(record[6]) || 0);
    const cachedTokens = inputTokens ? Math.min(inputTokens, cachedRaw) : cachedRaw;
    const billableInput = Math.max(0, inputTokens - cachedTokens);
    // Reasoning tokens are part of output-side billing in this estimate, so
    // split visible output and reasoning only for display composition.
    const billedReasoning = Math.min(outputTokens, reasoningRaw);
    const visibleOutput = Math.max(0, outputTokens - billedReasoning);
    const pricedTokens = billableInput + cachedTokens + visibleOutput + billedReasoning;
    if (!pricing) {
      const result = { ...emptyCost(), unpricedTokens: pricedTokens };
      recordCostCache.set(record, result);
      return result;
    }
    const multiplier = 1 / 1_000_000;
    const input = billableInput * pricing.input * multiplier;
    const cached = cachedTokens * pricing.cached * multiplier;
    const output = visibleOutput * pricing.output * multiplier;
    const reasoning = billedReasoning * pricing.output * multiplier;
    const result = {
      input,
      cached,
      output,
      reasoning,
      total: input + cached + output + reasoning,
      pricedTokens,
      unpricedTokens: 0,
    };
    recordCostCache.set(record, result);
    return result;
  };
  const rangeForPreset = (preset) => {
    const now = rangeNow();
    const today = localDayStart(new Date(now)).getTime();
    const todayLabel = today === localDayStart(new Date(Date.now())).getTime() ? "今天" : ymd(new Date(today));
    if (preset === "24h") return { start: now - DAY, end: now, preset, label: "最近24小时" };
    if (preset === "today") return { start: today, end: now, preset, label: todayLabel };
    if (preset === "7") return { start: today - 6 * DAY, end: now, preset, label: "7天内" };
    if (preset === "30") return { start: today - 29 * DAY, end: now, preset, label: "30天内" };
    if (preset === "history") return { start: Math.min(firstDataTime, now), end: now, preset, label: "历史总览" };
    const startInput = parseYmdStart($<HTMLInputElement>("startDate")?.value) ?? today;
    const endInput = parseYmdStart($<HTMLInputElement>("endDate")?.value) ?? today;
    const start = Math.min(startInput, endInput);
    const end = Math.min(now, Math.max(startInput, endInput) + DAY);
    return { start, end, preset: "custom", label: formatRangeLabel(start, end, "custom") };
  };
  const emptyUsage = () => ({ input: 0, cached: 0, output: 0, reasoning: 0, total: 0, requests: 0, cost: 0 });
  const privateLabel = (kind, index = 1) => `${kind} ${String(index).padStart(2, "0")}`;
  const displayName = (value, kind, index = 1) => uiState.privacyMode ? privateLabel(kind, index) : String(value || privateLabel(kind, index));
  const buildBuckets = (filtered, range) => {
    // Bucket count is adaptive: short ranges stay detailed, long ranges stay
    // light enough for a static file opened directly in the browser.
    const duration = Math.max(1, range.end - range.start);
    const dayCount = duration / DAY;
    const bucketCount = dayCount <= 1 ? 12 : dayCount <= 7 ? 7 : Math.min(16, Math.ceil(dayCount / 2));
    const step = duration / bucketCount;
    const multiDay = dayCount > 1.2;
    const buckets = Array.from({ length: bucketCount }, (_, index) => ({
      ...emptyUsage(),
      start: range.start + index * step,
      end: index === bucketCount - 1 ? range.end + 1 : range.start + (index + 1) * step,
    }));
    for (const record of filtered) {
      const idx = Math.max(0, Math.min(bucketCount - 1, Math.floor((record[0] - range.start) / step)));
      const bucket = buckets[idx];
      bucket.input += record[3] || 0;
      bucket.cached += record[4] || 0;
      bucket.output += record[5] || 0;
      bucket.reasoning += record[6] || 0;
      bucket.total += record[7] || 0;
      bucket.requests += 1;
      bucket.cost += priceRecord(record).total || 0;
    }
    return buckets.map((bucket) => ({ ...bucket, label: formatBucketLabel(bucket.start, multiDay), stepMinutes: step / 60000 }));
  };
  const computePeakRate = (filtered, range) => {
    // Sliding one-minute sum over the selected range, used for the TPM card.
    let left = 0;
    let sum = 0;
    let peakTotal = 0;
    let peakTs = NaN;
    for (let right = 0; right < filtered.length; right += 1) {
      const current = filtered[right];
      const currentTs = recordTime(current);
      sum += Number(current[7]) || 0;
      while (left <= right && currentTs - recordTime(filtered[left]) >= RATE_WINDOW_MS) {
        sum -= Number(filtered[left][7]) || 0;
        left += 1;
      }
      if (sum > peakTotal) {
        peakTotal = sum;
        peakTs = currentTs;
      }
    }
    return {
      total: peakTotal,
      label: formatPeakLabel(peakTs, range),
      tpm: peakTotal / (RATE_WINDOW_MS / 60000),
    };
  };
  const computePeakOutputRate = (filtered, range) => {
    let left = 0;
    let sum = 0;
    let peakOutput = 0;
    let peakTs = NaN;
    for (let right = 0; right < filtered.length; right += 1) {
      const current = filtered[right];
      const currentTs = recordTime(current);
      sum += Number(current[5]) || 0;
      while (left <= right && currentTs - recordTime(filtered[left]) >= RATE_WINDOW_MS) {
        sum -= Number(filtered[left][5]) || 0;
        left += 1;
      }
      if (sum > peakOutput) {
        peakOutput = sum;
        peakTs = currentTs;
      }
    }
    return {
      output: peakOutput,
      label: formatPeakLabel(peakTs, range),
      tps: peakOutput / (RATE_WINDOW_MS / 1000),
    };
  };
  const computeStats = (range) => {
    // All date-filtered views are derived from compact local records here.
    // No network request is needed to switch ranges or ranking modes.
    const filtered = rowsInRange(records, range);
    const failures = rowsInRange(failureRecords, range);
    const ttfb = rowsInRange(ttfbRecords, range);
    const totals = emptyUsage();
    const costs = emptyCost();
    const bySession = new Map();
    const byModel = new Map();
    const byProject = new Map();
    const failureBySession = new Map();
    for (const failure of failures) {
      const sid = failure[1] || "unknown";
      failureBySession.set(sid, (failureBySession.get(sid) || 0) + 1);
      const catalog = sessionsCatalog[sid] || {};
      const projectName = catalog.name || `会话 ${String(sid).slice(-6)}`;
      const project = byProject.get(projectName) || { name: projectName, tokens: 0, requests: 0, failures: 0, cost: 0, input: 0, cached: 0 };
      project.failures += 1;
      byProject.set(projectName, project);
    }
    for (const record of filtered) {
      const recordCost = priceRecord(record);
      addCost(costs, recordCost);
      totals.input += record[3] || 0;
      totals.cached += record[4] || 0;
      totals.output += record[5] || 0;
      totals.reasoning += record[6] || 0;
      totals.total += record[7] || 0;
      totals.requests += 1;
      const sid = record[1] || "unknown";
      const model = record[2] || "unknown";
      const catalog = sessionsCatalog[sid] || {};
      const projectName = catalog.name || `会话 ${String(sid).slice(-6)}`;
      const session = bySession.get(sid) || { name: projectName, model, tokens: 0, requests: 0, failures: failureBySession.get(sid) || 0, status: "ok" };
      session.tokens += record[7] || 0;
      session.requests += 1;
      session.status = session.failures ? "warn" : "ok";
      bySession.set(sid, session);
      const project = byProject.get(projectName) || { name: projectName, tokens: 0, requests: 0, failures: 0, cost: 0, input: 0, cached: 0 };
      project.tokens += record[7] || 0;
      project.requests += 1;
      project.cost += recordCost.total || 0;
      project.input += record[3] || 0;
      project.cached += record[4] || 0;
      byProject.set(projectName, project);
      const modelRow = byModel.get(model) || { name: model, tokens: 0, output: 0, requests: 0, cost: 0, latencyTotal: 0, latencyCount: 0 };
      modelRow.tokens += record[7] || 0;
      modelRow.output += record[5] || 0;
      modelRow.requests += 1;
      modelRow.cost += recordCost.total || 0;
      byModel.set(model, modelRow);
    }
    for (const record of ttfb) {
      const model = record[2] || "unknown";
      const modelRow = byModel.get(model) || { name: model, tokens: 0, output: 0, requests: 0, cost: 0, latencyTotal: 0, latencyCount: 0 };
      modelRow.latencyTotal += record[3] || 0;
      modelRow.latencyCount += 1;
      byModel.set(model, modelRow);
    }
    const buckets = buildBuckets(filtered, range);
    const peak = computePeakRate(filtered, range);
    const peakOutput = computePeakOutputRate(filtered, range);
    const cacheHit = totals.input ? totals.cached / totals.input * 100 : 0;
    const failureRate = totals.requests ? failures.length / totals.requests * 100 : 0;
    const successRate = totals.requests ? Math.max(0, (totals.requests - failures.length) / totals.requests * 100) : 100;
    const sessions = Array.from(bySession.values());
    const projects = Array.from(byProject.values()).sort((a, b) => b.tokens - a.tokens || b.requests - a.requests).slice(0, 6);
    const maxSessionTokens = Math.max(1, ...sessions.map((row) => row.tokens));
    const maxSessionRequests = Math.max(1, ...sessions.map((row) => row.requests));
    const maxProjectTokens = Math.max(1, ...projects.map((row) => row.tokens));
    const models = Array.from(byModel.values()).sort((a, b) => b.tokens - a.tokens).slice(0, 12);
    const maxModelTokens = Math.max(1, ...models.map((row) => row.tokens));
    const costModels = Array.from(byModel.values()).sort((a, b) => b.cost - a.cost).slice(0, 4);
    const maxModelCost = Math.max(1, ...costModels.map((row) => row.cost));
    const costParts = [
      { key: "input", name: "输入", value: costs.input, className: "cost-input" },
      { key: "cached", name: "缓存", value: costs.cached, className: "cost-cache" },
      { key: "output", name: "输出", value: costs.output, className: "cost-output" },
      { key: "reasoning", name: "推理", value: costs.reasoning, className: "cost-reasoning" },
    ].map((part) => ({
      ...part,
      percent: costs.total ? part.value / costs.total * 100 : 0,
    }));
    const topProject = projects[0] || null;
    const primaryUsed = Number(limits.primaryUsed);
    const secondaryUsed = Number(limits.secondaryUsed);
    const maxLimitUsed = Math.max(
      Number.isFinite(primaryUsed) ? primaryUsed : 0,
      Number.isFinite(secondaryUsed) ? secondaryUsed : 0,
    );
    let riskText = hasLimitData ? "安全" : "未知";
    let riskTone = hasLimitData ? "safe" : "neutral";
    let riskNote = hasLimitData ? `最高额度已用 ${pct(maxLimitUsed)}` : "本地日志暂无额度数据";
    if (limits.rateLimitReachedType || maxLimitUsed >= 90) {
      riskText = "危险";
      riskTone = "danger";
      riskNote = limits.rateLimitReachedType ? "已经触发限流" : `最高额度已用 ${pct(maxLimitUsed)}`;
    } else if (maxLimitUsed >= 70 || failureRate >= 5) {
      riskText = "注意";
      riskTone = "warn";
      riskNote = failureRate >= 5 ? `失败率 ${failureRate.toFixed(1)}%` : `最高额度已用 ${pct(maxLimitUsed)}`;
    }
    let wasteText = "暂无明显浪费";
    let wasteNote = "当前范围运行稳定";
    if (failureRate >= 5) {
      wasteText = "失败率偏高";
      wasteNote = `${failures.length} 次失败，建议先看失败会话`;
    } else if (totals.input > 0 && cacheHit < 45) {
      wasteText = "缓存偏低";
      wasteNote = `缓存命中 ${cacheHit.toFixed(1)}%，重复上下文可能偏少`;
    } else if (peak.total > 0 && totals.total > 0 && peak.total / totals.total > 0.38) {
      wasteText = "峰值集中";
      wasteNote = `${peak.label} 占用峰值 ${fmt(peak.total)}`;
    }
    let actionText = "继续观察";
    let actionNote = "当前没有必须立刻处理的风险";
    if (riskTone === "danger") {
      actionText = "降低强度";
      actionNote = "暂停高并发任务，优先处理必要会话";
    } else if (riskTone === "warn") {
      actionText = "切小模型";
      actionNote = "接近额度时优先使用 mini 或轻量模型";
    } else if (topProject && topProject.tokens / Math.max(1, totals.total) > 0.55) {
      actionText = "检查项目";
      actionNote = `${topProject.name} 占比偏高，适合先优化提示和上下文`;
    }
    const ttfbValues = ttfb
      .map((row) => Number(row[3]) || 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    const ttfbCount = ttfbValues.length;
    const avgTtfb = ttfbCount ? ttfbValues.reduce((sum, value) => sum + value, 0) / ttfbCount : 0;
    const p95Ttfb = ttfbCount ? ttfbValues[Math.min(ttfbCount - 1, Math.ceil(ttfbCount * 0.95) - 1)] : 0;
    const bestTtfb = ttfbCount ? ttfbValues[0] : 0;
    const medianTtfb = ttfbCount
      ? ttfbCount % 2
        ? ttfbValues[(ttfbCount - 1) / 2]
        : (ttfbValues[ttfbCount / 2 - 1] + ttfbValues[ttfbCount / 2]) / 2
      : 0;
    const slowThresholdMs = 15000;
    const slowCount = ttfbValues.filter((value) => value >= slowThresholdMs).length;
    const slowRate = ttfbCount ? slowCount / ttfbCount * 100 : 0;
    const firstTs = recordTime(filtered[0]);
    const lastTs = recordTime(filtered[filtered.length - 1]);
    const activeMs = filtered.length > 1 ? Math.max(RATE_WINDOW_MS, lastTs - firstTs) : RATE_WINDOW_MS;
    const avgOutputTps = totals.output / Math.max(1, activeMs / 1000);
    const avgOutputPerMinute = avgOutputTps * 60;
    const avgOutputPerRequest = totals.requests ? totals.output / totals.requests : 0;
    const ttfbSpread = medianTtfb ? p95Ttfb / medianTtfb : 0;
    let speedStatus = "缺少测速";
    let speedNote = "当前日志没有首 token 字段，仅展示输出吞吐估算。";
    if (ttfbCount) {
      speedStatus = avgTtfb <= 8000 ? "响应很快" : avgTtfb <= 15000 ? "响应正常" : "响应偏慢";
      speedNote = slowCount
        ? `${slowCount} 次首 token 超过 ${fmtMs(slowThresholdMs)}，建议关注对应模型或网络。`
        : "首 token 波动可控，输出吞吐按活跃窗口估算。";
    }
    const waitScore = ttfbCount
      ? avgTtfb <= 6000
        ? 100
        : avgTtfb <= 12000
          ? 100 - (avgTtfb - 6000) / 6000 * 22
          : avgTtfb <= 22000
            ? 78 - (avgTtfb - 12000) / 10000 * 38
            : Math.max(10, 40 - (avgTtfb - 22000) / 10000 * 20)
      : 58;
    const stabilityScore = ttfbCount ? Math.max(0, 100 - slowRate * 1.25) : 58;
    const throughputScore = clamp(avgOutputPerMinute / 12000 * 100, 15, 100);
    const speedScore = Math.round(clamp(
      waitScore * (ttfbCount ? 0.55 : 0.20)
      + stabilityScore * (ttfbCount ? 0.35 : 0.20)
      + throughputScore * (ttfbCount ? 0.10 : 0.60),
    ));
    let speedGrade = "样本不足";
    let speedBandLabel = "需要更多调用";
    let speedReason = "当前范围缺少开始出字记录，只能参考输出速度。";
    let speedTone = "unknown";
    if (totals.requests) {
      if (speedScore >= 85) {
        speedGrade = "很快";
        speedBandLabel = "85+ 顺滑";
        speedReason = "开始出字快，连续对话体感顺滑。";
        speedTone = "good";
      } else if (speedScore >= 70) {
        speedGrade = "正常";
        speedBandLabel = "70-84 可用";
        speedReason = "当前速度正常，可继续使用。";
        speedTone = "ok";
      } else if (speedScore >= 55) {
        speedGrade = "可用偏慢";
        speedBandLabel = "55-69 略慢";
        speedReason = "能用，但等待感已经比较明显。";
        speedTone = "warn";
      } else if (speedScore >= 40) {
        speedGrade = "明显偏慢";
        speedBandLabel = "40-54 偏慢";
        speedReason = "开始出字或慢请求会明显影响操作节奏。";
        speedTone = "danger";
      } else {
        speedGrade = "很慢";
        speedBandLabel = "<40 卡顿";
        speedReason = "当前速度不适合连续高频操作。";
        speedTone = "danger";
      }
      if (ttfbCount && slowRate >= 35) {
        speedReason = "慢请求偏多，主要卡在开始出字前。";
      } else if (ttfbCount && avgTtfb >= slowThresholdMs) {
        speedReason = "开始出字等待偏长，体感会卡。";
      } else if (avgOutputPerMinute > 0 && avgOutputPerMinute < 3000) {
        speedReason = "开始响应尚可，但输出吞吐偏低。";
      }
    }
    const speedBars = buckets.slice(0, 16).map((row) => ({
      label: row.label,
      output: row.output || 0,
      speed: (row.output || 0) / Math.max(1, (row.stepMinutes || 1) * 60),
    }));
    const speedModels = models
      .filter((row) => row.latencyCount || row.output)
      .slice()
      .sort((a, b) => {
        const latencyA = a.latencyCount ? a.latencyTotal / a.latencyCount : Infinity;
        const latencyB = b.latencyCount ? b.latencyTotal / b.latencyCount : Infinity;
        return latencyA - latencyB || b.output - a.output;
      })
      .slice(0, 4)
      .map((row) => ({
        name: row.name,
        firstTokenLabel: row.latencyCount ? fmtMs(row.latencyTotal / row.latencyCount) : "--",
        outputLabel: fmt(row.output || 0),
        requests: row.requests || 0,
      }));
    return {
      label: range.label,
      summary: {
        totalTokensLabel: fmt(totals.total),
        inputLabel: fmt(totals.input),
        cachedLabel: fmt(totals.cached),
        outputLabel: fmt(totals.output),
        reasoningLabel: fmt(totals.reasoning),
        requestsLabel: totals.requests.toLocaleString(),
        failures: failures.length,
        successRateLabel: `${successRate.toFixed(1)}%`,
        cacheHitLabel: `${cacheHit.toFixed(1)}%`,
        peakLabel: fmt(peak.total),
        peakTime: peak.label,
        peakTpmLabel: `${fmt(peak.tpm)} TPM`,
      },
      cost: {
        total: costs.total,
        average: totals.requests ? costs.total / totals.requests : 0,
        rangeTokensLabel: fmt(totals.total),
        parts: costParts,
        unpricedTokens: costs.unpricedTokens,
      },
      performance: {
        status: speedStatus,
        note: speedNote,
        speedScoreLabel: totals.requests ? `${speedScore}分` : "--",
        speedGrade,
        speedBandLabel,
        speedReason,
        speedTone,
        firstTokenLabel: fmtMs(avgTtfb),
        p95FirstTokenLabel: fmtMs(p95Ttfb),
        bestFirstTokenLabel: fmtMs(bestTtfb),
        medianFirstTokenLabel: fmtMs(medianTtfb),
        slowRateLabel: ttfbCount ? `${slowRate.toFixed(0)}%` : "--",
        slowDetailLabel: ttfbCount ? `${slowCount}/${ttfbCount} 次 > ${fmtMs(slowThresholdMs)}` : "没有开始出字样本",
        firstTokenSpreadLabel: ttfbCount ? `${ttfbSpread.toFixed(1)}x` : "--",
        firstTokenSpreadNote: ttfbCount ? `P95 ${fmtMs(p95Ttfb)} / 中位 ${fmtMs(medianTtfb)}` : "暂无可计算样本",
        avgOutputSpeedLabel: fmtRate(avgOutputTps),
        avgOutputTpmLabel: `${fmt(avgOutputTps * 60)} TPM`,
        peakOutputSpeedLabel: fmtRate(peakOutput.tps),
        peakOutputLabel: `${fmt(peakOutput.output)} output`,
        peakOutputTime: peakOutput.label,
        slowCount,
        slowLabel: `${slowCount}/${ttfbCount || totals.requests || 0}`,
        coverageLabel: `${ttfbCount}/${totals.requests || 0} 次可测速`,
        activeWindowLabel: fmtDuration(activeMs),
        outputTotalLabel: fmt(totals.output),
        avgOutputPerMinuteLabel: `${fmt(avgOutputPerMinute)}/分钟`,
        outputPerMinuteNote: `活跃 ${fmtDuration(activeMs)} · 共 ${fmt(totals.output)} output`,
        avgOutputPerRequestLabel: totals.requests ? `${fmt(avgOutputPerRequest)}/次` : "--",
        outputPerRequestNote: totals.requests ? `${fmt(totals.output)} output / ${totals.requests} 次` : "当前范围没有调用",
        bars: speedBars,
        models: speedModels,
      },
      trend: buckets,
      distribution: buckets,
      sessions: sessions.map((row, index) => ({
        ...row,
        rank: index + 1,
        tokensLabel: fmt(row.tokens),
        tokenPercent: Math.round(row.tokens / maxSessionTokens * 100),
        requestPercent: Math.round(row.requests / maxSessionRequests * 100),
      })),
      projects: projects.map((row, index) => ({
        ...row,
        rank: index + 1,
        tokensLabel: fmt(row.tokens),
        costLabel: moneyCompact(row.cost || 0),
        cacheHit: row.input ? row.cached / row.input * 100 : 0,
        failureRate: row.requests ? row.failures / row.requests * 100 : 0,
        percent: Math.round(row.tokens / maxProjectTokens * 100),
      })),
      models: models.map((row) => ({
        name: row.name,
        tokens: row.tokens,
        output: row.output || 0,
        tokensLabel: fmt(row.tokens),
        requests: row.requests,
        latency: row.latencyCount ? row.latencyTotal / row.latencyCount / 1000 : 0,
        latencyLabel: row.latencyCount ? `${(row.latencyTotal / row.latencyCount / 1000).toFixed(2)}s` : "--",
        cost: row.cost || 0,
        percent: Math.round(row.tokens / maxModelTokens * 100),
      })),
      costModels: costModels.map((row, index) => ({
        name: row.name,
        rank: index + 1,
        cost: row.cost || 0,
        percent: Math.round((row.cost || 0) / maxModelCost * 100),
      })),
      risk: [
        { name: "5h 窗口", value: limits.primaryRemaining ?? 0, label: `${pct(limits.primaryRemaining ?? 0)} 剩余`, note: `已用 ${pct(limits.primaryUsed || 0)} · ${limits.primaryReset || "--"}`, tone: "blue" },
        { name: "周限额", value: limits.secondaryRemaining ?? 0, label: `${pct(limits.secondaryRemaining ?? 0)} 剩余`, note: `已用 ${pct(limits.secondaryUsed || 0)} · ${limits.secondaryReset || "--"}`, tone: "violet" },
        { name: "缓存", value: cacheHit, label: `命中 ${cacheHit.toFixed(0)}%`, note: "输入 token", tone: "magenta" },
        { name: "失败", value: failureRate, label: `${failureRate.toFixed(1)}%`, note: `${failures.length} 次失败`, tone: failures.length ? "danger" : "blue" },
      ],
      decision: {
        rangeLabel: range.label,
        riskText,
        riskTone,
        riskNote,
        topProject: topProject?.name || "--",
        topProjectNote: topProject ? `${fmt(topProject.tokens)} Token · ${topProject.requests} 次调用` : "当前范围暂无项目",
        wasteText,
        wasteNote,
        actionText,
        actionNote,
      },
    };
  };
  const applyStats = (stats) => {
    summary = stats.summary;
    summary.rangeLabel = stats.label;
    trendRows = stats.trend;
    distributionRows = stats.distribution;
    sessionRows = stats.sessions;
    modelRows = stats.models;
    projectRows = stats.projects;
    costModelRows = stats.costModels;
    riskRows = stats.risk;
    costSummary = stats.cost;
    decisionSummary = stats.decision;
    performanceSummary = stats.performance || {};
    setText("tokenTotal", summary.totalTokensLabel || "--");
    setText("inputTokens", summary.inputLabel || "--");
    setText("cachedTokens", summary.cachedLabel || "--");
    setText("outputTokens", summary.outputLabel || "--");
    setText("reasoningTokens", summary.reasoningLabel || "--");
    setText("requestCount", summary.requestsLabel || "0");
    setText("successRate", summary.successRateLabel || "--");
    setText("failureCount", summary.failures ?? "0");
    setText("cacheHit", summary.cacheHitLabel || "--");
    setText("peakRate", (summary.peakTpmLabel || "--").replace(/\s*TPM$/, ""));
    setText("chartMeta", `累计 ${summary.totalTokensLabel || "--"}`);
  };
  const isSampleData = data.sample === true;
  const quotaSourceLabel = (withPrefix = true) => {
    const limitId = String(limits.limitId || "").toLowerCase();
    const limitName = String(limits.limitName || "");
    const plan = String(limits.planType || "").toUpperCase();
    let label = "额度状态";
    if (isSampleData) {
      label = "示例数据";
    } else if (limitId === "codex") {
      label = plan && plan !== "UNKNOWN" ? `Codex ${plan} 全局额度` : "Codex 全局额度";
    } else if (limitName) {
      label = `${limitName} 限额`;
    } else if (limitId) {
      label = `${limitId} 限额`;
    }
    return withPrefix ? `来源：${label}` : label;
  };
  const updateSourceLabels = () => {
    if (uiState.privacyMode) {
      setText("sourcePrimary", "本地数据");
      setText("sourceSecondary", "名称已隐藏");
      setText("sourceTertiary", "隐私模式");
      setText("quotaSource", "来源：已隐藏");
      setText("syncText", "截图安全");
      return;
    }
    setText("sourcePrimary", isSampleData ? "示例数据" : "Codex 桌面端");
    setText("sourceSecondary", isSampleData ? "直接预览" : "本地日志");
    setText("sourceTertiary", isSampleData ? "运行脚本看真实数据" : quotaSourceLabel(false));
    setText("quotaSource", quotaSourceLabel(true));
    setText("syncText", isSampleData ? "Demo 预览" : `${data.generatedAt?.slice(11, 16) || "--"} 已同步`);
  };
  updateSourceLabels();

  const startLocalAutoRefresh = () => {
    const localHost = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(window.location.hostname);
    const localHttp = (window.location.protocol === "http:" || window.location.protocol === "https:") && localHost;
    if (!localHttp || isSampleData) return;

    let knownGeneratedAt = String(data.generatedAt || "");
    let reloadPending = false;
    const pollStatus = async () => {
      if (reloadPending) return;
      try {
        const response = await fetch(`/api/status?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json();
        const nextGeneratedAt = String(status.generatedAt || "");
        if (nextGeneratedAt && knownGeneratedAt && nextGeneratedAt !== knownGeneratedAt) {
          reloadPending = true;
          if (!uiState.privacyMode) setText("syncText", "数据已更新");
          window.location.reload();
          return;
        }
        if (nextGeneratedAt) knownGeneratedAt = nextGeneratedAt;
        if (!uiState.privacyMode && status.running) setText("syncText", "刷新中");
      } catch {
        // Static file mode and plain HTTP servers do not expose the local status API.
      }
    };

    window.setTimeout(pollStatus, 5_000);
    window.setInterval(pollStatus, 60_000);
  };
  startLocalAutoRefresh();

  const primaryRemain = limits.primaryRemaining ?? null;
  const secondaryRemain = limits.secondaryRemaining ?? null;
  const hasLimitData = primaryRemain !== null || secondaryRemain !== null;
  setText("shieldState", limits.rateLimitReachedType ? "已触发限流" : hasLimitData ? "当前安全" : "等待数据");
  if (primaryRemain !== null) {
    setText("primaryRemain", pct(primaryRemain));
    const primaryFill = $("primaryFill");
    if (primaryFill) primaryFill.style.width = pct(primaryRemain);
    setText("primaryNote", `已用 ${pct(limits.primaryUsed)} · reset ${limits.primaryReset || "--"}`);
  }
  if (secondaryRemain !== null) {
    setText("secondaryRemain", pct(secondaryRemain));
    const secondaryFill = $("secondaryFill");
    if (secondaryFill) secondaryFill.style.width = pct(secondaryRemain);
    setText("secondaryNote", `已用 ${pct(limits.secondaryUsed)} · reset ${limits.secondaryReset || "--"}`);
  }
  setText("planType", (limits.planType || "Pro").toUpperCase());

  const setRing = (selector, remain, radius) => {
    const el = document.querySelector(selector);
    if (!el || remain === null || remain === undefined) return;
    const circumference = Math.PI * 2 * radius;
    el.style.strokeDasharray = `${circumference * Math.max(0, Math.min(100, remain)) / 100} ${circumference}`;
  };
  setRing(".ring-main", primaryRemain, 76);
  setRing(".ring-teal", secondaryRemain, 58);

  const niceMax = (value) => {
    if (!value) return 1000;
    const pow = Math.pow(10, Math.floor(Math.log10(value)));
    return Math.ceil(value / pow) * pow;
  };
  const compact = (value) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${Math.round(value / 1e3)}K`;
    return `${Math.round(value)}`;
  };
  const tinyToken = (value) => {
    value = Number(value) || 0;
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (Math.abs(value) >= 1e6) return `${Math.round(value / 1e6)}M`;
    if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)}K`;
    return `${Math.round(value)}`;
  };
  const smoothPath = (points) => {
    if (!points.length) return "";
    if (points.length < 2) return `M${points[0][0]} ${points[0][1]}`;
    const minY = Math.min(...points.map((point) => point[1]));
    const maxY = Math.max(...points.map((point) => point[1]));
    const clampY = (value) => Math.max(minY, Math.min(maxY, value));
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const sparkPath = (rows, key, width = 126, height = 42) => {
    const values = (rows || []).map((row) => Number(row[key]) || 0);
    if (!values.length) return "";
    const maxValue = Math.max(1, ...values);
    const pad = 2;
    const points = values.map((value, index) => [
      Math.round(pad + (width - pad * 2) * index / Math.max(1, values.length - 1)),
      Math.round(height - pad - (height - pad * 2) * value / maxValue),
    ]);
    return smoothPath(points);
  };
  const setPath = (id, d) => {
    const path = $(id);
    if (path) path.setAttribute("d", d);
  };

  const seriesConfig = {
    total: { label: "总量", color: "var(--framer-chart-total, #ffffff)", width: 3, area: "areaBlue", tone: "total" },
    cached: { label: "缓存", color: "var(--framer-chart-cache, #0099ff)", width: 2.6, area: "areaTeal", tone: "cache" },
    output: { label: "输出", color: "var(--framer-chart-output, #6a4cf5)", width: 2.2, tone: "output" },
    input: { label: "输入", color: "var(--framer-chart-input, #0099ff)", width: 2.2, tone: "input" },
    reasoning: { label: "推理", color: "var(--framer-chart-reasoning, #d44df0)", width: 2.2, tone: "reasoning" },
  };

  const trendRowsForMode = (rows) => {
    // Interval mode uses each bucket as-is. Cumulative mode turns the same
    // buckets into running totals so both modes share one data source.
    if (uiState.trendMode === "interval") {
      return rows.map((row) => ({ ...row }));
    }
    const running = { total: 0, cached: 0, output: 0, input: 0, reasoning: 0 };
    return rows.map((row) => {
      Object.keys(running).forEach((key) => {
        running[key] += Number(row[key]) || 0;
      });
      return { ...row, ...running };
    });
  };

  const renderTrendControls = () => {
    document.querySelectorAll<HTMLElement>(".trend-mode").forEach((button) => {
      button.classList.toggle("active", button.dataset.trendMode === uiState.trendMode);
    });
    document.querySelectorAll<HTMLElement>(".trend-scale").forEach((button) => {
      button.classList.toggle("active", button.dataset.trendScale === uiState.trendScale);
    });
    document.querySelectorAll<HTMLElement>(".legend-item[data-series]").forEach((button) => {
      const key = button.dataset.series;
      const active = !!uiState.trendSeries[key];
      const check = button.querySelector<HTMLElement>(".check");
      const config = seriesConfig[key] || {};
      button.classList.toggle("off", !active);
      button.setAttribute("aria-pressed", String(active));
      button.title = `${active ? "隐藏" : "显示"}${config.label || key}曲线`;
      if (check) {
        const tone = active && config.tone ? ` ${config.tone}` : "";
        check.className = `check${active ? " on" : ""}${tone}`;
        check.innerHTML = active ? `<svg viewBox="0 0 16 16"><path d="m4 8 2.3 2.4L12 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
        if (active && key === "input") check.style.background = "";
        else check.style.background = "";
      }
    });
  };

  const renderChart = () => {
    // Draw the main SVG trend from active series, selected trend mode, and
    // selected y-axis scale. The tooltip marks the latest cumulative point
    // or the highest interval bucket.
    const svg = $("trendChart");
    const baseRows = trendRows || [];
    if (!svg || baseRows.length < 2) return;
    renderTrendControls();
    const rows = trendRowsForMode(baseRows);
    const activeKeys = Object.keys(seriesConfig).filter((key) => uiState.trendSeries[key]);
    if (!activeKeys.length) return;
    const primaryKey = activeKeys.includes("total") ? "total" : activeKeys[0];
    const primaryConfig = seriesConfig[primaryKey];
    const compactChart = window.innerWidth <= 480;
    const maxY = niceMax(Math.max(...rows.flatMap((row) => activeKeys.map((key) => row[key] || 0))));
    const logScale = uiState.trendScale === "log";
    const logMax = Math.max(1, Math.log10(maxY + 1));
    const left = compactChart ? 14 : 40;
    const right = compactChart ? 990 : 985;
    const top = 22, bottom = 194;
    const x = (index) => Math.round(left + (right - left) * index / (rows.length - 1));
    const y = (value) => {
      const safeValue = Math.max(0, Number(value) || 0);
      const ratio = logScale ? Math.log10(safeValue + 1) / logMax : safeValue / maxY;
      return Math.round(bottom - (bottom - top) * ratio);
    };
    const series = (key) => rows.map((row, index) => [x(index), y(row[key] || 0)]);
    const primary = series(primaryKey);
    const peakIndex = uiState.trendMode === "interval"
      ? rows.reduce((best, row, index) => (row[primaryKey] || 0) > (rows[best][primaryKey] || 0) ? index : best, 0)
      : rows.length - 1;
    const peakPoint = primary[peakIndex];
    const area = (points) => `${smoothPath(points)} L${points[points.length - 1][0]} ${bottom} L${points[0][0]} ${bottom} Z`;
    const yTicks = logScale
      ? [maxY, maxY / 10, maxY / 100, maxY / 1000, maxY / 10000, 0].filter((tick, index, all) => index === all.length - 1 || tick >= 1)
      : [1, .8, .6, .4, .2, 0].map((ratio) => Math.round(maxY * ratio));
    const showXLabel = (index) => compactChart
      ? index === 0 || index === peakIndex || index === rows.length - 1
      : index % 2 === 0 || index === rows.length - 1;
    const xLabels = rows.map((row, index) => showXLabel(index)
      ? `<text x="${x(index) - 16}" y="211" class="chart-label">${esc(row.label)}</text>`
      : ""
    ).join("");
    const gridLines = yTicks.filter((tick) => tick > 0).map((tick) => `<line x1="${left}" y1="${y(tick)}" x2="${right}" y2="${y(tick)}" class="grid-line"/>`).join("");
    const yLabels = compactChart ? "" : yTicks.map((tick) => `<text x="${tick === 0 ? 22 : 2}" y="${Math.min(198, y(tick) + 4)}" class="chart-label">${compact(tick)}</text>`).join("");
    const metaPrefix = uiState.trendMode === "interval" ? "分时峰值" : "累计";
    const metaLabel = `${metaPrefix} ${primaryConfig.label} ${fmt(rows[peakIndex][primaryKey] || 0)}`;
    setText("chartMeta", metaLabel);
    const tooltip = compactChart ? "" : `
      <rect x="${Math.min(right - 150, Math.max(left + 8, peakPoint[0] - 16))}" y="${Math.max(0, peakPoint[1] - 34)}" width="146" height="34" rx="5" class="tooltip-box"/>
      <text x="${Math.min(right - 137, Math.max(left + 21, peakPoint[0] - 3))}" y="${Math.max(21, peakPoint[1] - 13)}" class="tooltip-label">${esc(metaLabel)}</text>`;
    const areaPath = `<path data-series-area="${primaryKey}" d="${area(primary)}" fill="url(#areaSelected)"/>`;
    const linePaths = activeKeys.map((key) => {
      const config = seriesConfig[key];
      return `<path data-series="${key}" d="${smoothPath(series(key))}" fill="none" stroke="${config.color}" stroke-width="${config.width}" stroke-linecap="round"/>`;
    }).join("");
    svg.innerHTML = `
      <defs>
        <linearGradient id="areaSelected" x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="${primaryConfig.color}" stop-opacity=".16"/>
          <stop offset="1" stop-color="${primaryConfig.color}" stop-opacity=".02"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" class="axis-line"/>
      ${yLabels}
      ${areaPath}
      ${linePaths}
      <line x1="${peakPoint[0]}" y1="${peakPoint[1]}" x2="${peakPoint[0]}" y2="${bottom}" stroke="${primaryConfig.color}" stroke-width="1.5" stroke-dasharray="6 5"/>
      <circle cx="${peakPoint[0]}" cy="${peakPoint[1]}" r="9" class="peak-ring" stroke="${primaryConfig.color}" stroke-width="2"/>
      <circle cx="${peakPoint[0]}" cy="${peakPoint[1]}" r="4.6" fill="${primaryConfig.color}"/>
      ${tooltip}
      ${xLabels}
    `;
  };

  const renderSessions = () => {
    // Session ranking is intentionally re-sorted at render time so the same
    // computed rows can switch between Token and request-count rankings.
    const allRows = sessionRows || [];
    const tokenMode = uiState.sessionMode !== "requests";
    document.querySelectorAll<HTMLElement>(".session-mode").forEach((button) => {
      button.classList.toggle("active", button.dataset.sessionMode === uiState.sessionMode);
    });
    const rankedRows = [...allRows]
      .sort((a, b) => {
        const primary = tokenMode ? b.tokens - a.tokens : b.requests - a.requests;
        return primary || b.tokens - a.tokens || b.requests - a.requests || String(a.name).localeCompare(String(b.name));
      })
      .slice(0, 20);
    const rows = uiState.sessionsExpanded ? rankedRows : rankedRows.slice(0, 5);
    const head = `
      <div class="session-head">
        <span>会话</span><span>模型</span><span>${tokenMode ? "Token 消耗" : "调用分布"}</span><span>${tokenMode ? "Token" : "调用数"}</span><span>状态</span>
      </div>`;
    if (!allRows.length) {
      $("sessionList").innerHTML = head + `<div class="list-empty">当前范围没有会话调用</div>`;
      const toggle = $("toggleSessions");
      if (toggle) toggle.hidden = true;
      return;
    }
    $("sessionList").innerHTML = head + rows.map((row, index) => `
      <div class="session-row ${row.failures ? "row-warn" : ""}">
        <div class="session-top">
          <span class="rank-name"><i class="num ${index > 2 ? "muted" : ""}">${index + 1}</i><span class="rank-text">${esc(displayName(row.name, "项目", index + 1))}</span></span>
          <span class="pill">${esc(row.model)}</span>
          <span class="session-value">${tokenMode ? esc(row.tokensLabel) : `${esc(row.requests)} 次`}</span>
        </div>
        <span class="mini-bar"><span style="width:${Math.max(4, tokenMode ? row.tokenPercent || 0 : row.requestPercent || 0)}%"></span></span>
        <div class="session-meta">
          <span>${esc(row.requests)} 次调用</span>
          <span>${tokenMode ? "Token 消耗" : esc(row.tokensLabel)}</span>
          <span class="${row.failures ? "fail" : "ok"}">${row.failures ? `失败 ${esc(row.failures)}` : "正常"}</span>
        </div>
      </div>`).join("");
    const toggle = $("toggleSessions");
    if (toggle) {
      toggle.hidden = rankedRows.length <= 5;
      toggle.innerHTML = uiState.sessionsExpanded ? "收起会话 <span>↑</span>" : `展开会话 <span>${rankedRows.length}</span>`;
    }
  };

  const renderInsights = () => {
    const decision = decisionSummary || {};
    const range = decision.rangeLabel || summary.rangeLabel || "当前范围";
    const riskTone = decision.riskTone || "neutral";
    setText("insightSubtitle", `${range} · ${summary.totalTokensLabel || "--"} Token · ${summary.requestsLabel || "0"} 次调用`);
    setText("insightRiskBadge", decision.riskText || "评估中");
    $("insightRiskBadge")?.setAttribute("data-tone", riskTone);
    $("insightPanel")?.setAttribute("data-risk", riskTone);
    setText("insightTokenTotal", summary.totalTokensLabel || "--");
    setText("insightTokenNote", `输入 ${summary.inputLabel || "--"} · 输出 ${summary.outputLabel || "--"}`);
    setText("insightRisk", decision.riskText || "--");
    setText("insightRiskNote", decision.riskNote || "等待额度数据");
    setText("insightCallTotal", summary.requestsLabel || "0");
    setText("insightCallNote", `成功率 ${summary.successRateLabel || "--"} · 失败 ${summary.failures ?? 0}`);
    setText("insightCacheTotal", summary.cacheHitLabel || "--");
    setText("insightCacheNote", `缓存 ${summary.cachedLabel || "--"} / 输入 ${summary.inputLabel || "--"}`);
  };

  const renderProjects = () => {
    const rows = projectRows || [];
    setText("projectSummary", `${summary.rangeLabel || "当前范围"} · ${rows.length || 0} 个项目`);
    const list = $("projectList");
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = `<div class="list-empty">当前范围没有项目调用</div>`;
      return;
    }
    list.innerHTML = rows.slice(0, 5).map((row, index) => `
      <div class="project-row">
        <div class="project-main">
          <span class="project-rank">${index + 1}</span>
          <span class="project-name">${esc(displayName(row.name, "项目", index + 1))}</span>
          <span class="project-cost">${esc(row.costLabel || moneyCompact(row.cost || 0))}</span>
        </div>
        <div class="project-meter"><span style="width:${Math.max(4, row.percent || 0)}%"></span></div>
        <div class="project-meta">
          <span>${esc(row.tokensLabel)} Token</span>
          <span>${esc(row.requests)} 次调用</span>
          <span>缓存 ${esc((row.cacheHit || 0).toFixed(0))}%</span>
          <span class="${row.failures ? "fail" : ""}">失败 ${esc(row.failures || 0)}</span>
        </div>
      </div>`).join("");
  };

  const renderModels = () => {
    const colors = ["tone-blue", "tone-violet", "tone-magenta", "tone-white"];
    const allRows = modelRows || [];
    const rows = uiState.modelsExpanded ? allRows : allRows.slice(0, 4);
    const head = `
      <div class="session-head" style="grid-template-columns:120px 1fr 72px 62px">
        <span>模型</span><span></span><span>Token 总量</span><span>预估费用</span>
      </div>`;
    if (!allRows.length) {
      $("modelList").innerHTML = head + `<div class="list-empty">当前范围没有模型调用</div>`;
      const toggle = $("toggleModels");
      if (toggle) toggle.hidden = true;
      return;
    }
    $("modelList").innerHTML = head + rows.map((row, index) => `
      <div class="model-row">
        <span class="name">${esc(row.name)}</span>
        <span class="bar"><span class="${colors[index] || "tone-blue"}" style="width:${Math.max(4, row.percent || 0)}%"></span></span>
        <span class="tokens">${esc(row.tokensLabel)}</span>
        <span class="model-cost">${esc(money(row.cost || 0))}</span>
      </div>`).join("");
    const toggle = $("toggleModels");
    if (toggle) {
      toggle.hidden = allRows.length <= 4;
      toggle.innerHTML = uiState.modelsExpanded ? "收起模型 <span>↑</span>" : `展开模型 <span>${allRows.length}</span>`;
    }
  };

  const renderRisk = () => {
    const rows = riskRows || [];
    const icons = [
      `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"></rect><path d="M9 12h6"></path></svg>`,
      `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M12 8v4l3 2"></path></svg>`,
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5h10"></path><path d="M7 15.5h10"></path><path d="M9 6.5 7 8.5l2 2"></path><path d="M15 13.5l2 2-2 2"></path></svg>`,
      `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M12 8v5"></path><path d="M12 16.5h.01"></path></svg>`,
    ];
    $("riskList").innerHTML = rows.map((row, index) => `
      <div class="risk-row">
        <span class="risk-icon tone-${esc(row.tone || "blue")}">${icons[index] || icons[0]}</span><strong>${esc(row.name)}</strong>
        <span class="track"><span class="fill tone-${esc(row.tone || "blue")}" style="display:block;width:${Math.max(2, Math.min(100, row.value || 0))}%"></span></span>
        <span class="value">${esc(row.label)}${row.note ? `<small>${esc(row.note)}</small>` : ""}</span><span class="percent">${pct(row.value)}</span>
      </div>`).join("") + `
      <div class="warning">
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5 21 20H3L12 3.5Z"/>
          <path d="M12 9v5"/>
          <path d="M12 17h.01"/>
        </svg>
        <div>
          <strong>${esc(summary.peakTime || "--")} Token 峰值 ${esc(summary.peakLabel || "--")}</strong>
          <span>${limits.rateLimitReachedType ? "已触发限流，请降低并发。" : "未触发限流，系统运行正常。"}</span>
        </div>
        <span>›</span>
      </div>`;
  };

  const renderDistribution = () => {
    const chart = $("distributionChart");
    if (!chart) return;
    document.querySelectorAll<HTMLElement>(".dist-mode").forEach((button) => {
      button.classList.toggle("active", button.dataset.distMode === uiState.distributionMode);
    });
    const rows = distributionRows || [];
    const tokenMode = uiState.distributionMode === "tokens";
    const metricKey = tokenMode ? "total" : "requests";
    const metricName = tokenMode ? "Token 消耗" : "调用";
    const unitLabel = tokenMode ? "Token" : "次调用";
    const totalValue = rows.reduce((sum, row) => sum + (row[metricKey] || 0), 0);
    const totalLabel = tokenMode ? `${fmt(totalValue)} Token` : `${totalValue.toLocaleString()} 次`;
    setText("rangeSummary", `${summary.rangeLabel || ""}${summary.rangeLabel ? " · " : ""}${totalLabel}`.replace(/^ · /, ""));
    if (!rows.length || !totalValue) {
      chart.style.setProperty("--bar-count", "1");
      chart.innerHTML = `<div class="dist-empty">当前范围没有${metricName}记录</div>`;
      return;
    }
    const maxValue = Math.max(1, ...rows.map((row) => row[metricKey] || 0));
    chart.style.setProperty("--bar-count", String(Math.max(1, rows.length)));
    const axisMax = niceMax(maxValue);
    const yLabel = tokenMode ? tinyToken : compact;
    const bars = rows.map((row) => {
      const value = row[metricKey] || 0;
      const label = tokenMode ? tinyToken(value) : String(value);
      const detailLabel = tokenMode ? fmt(value) : String(value);
      const height = value ? Math.max(3, Math.round(value / axisMax * 100)) : 0;
      return `
      <div class="dist-bar" title="${esc(row.label)} · ${esc(detailLabel)} ${unitLabel}" aria-label="${esc(row.label)} ${esc(detailLabel)} ${unitLabel}">
        <span class="dist-bar-value">${esc(label)}</span>
        <span class="dist-bar-fill ${tokenMode ? "token" : ""}" style="height:${height}%"></span>
        <span class="dist-bar-label">${esc(row.label)}</span>
      </div>`;
    }).join("");
    const xLabels = rows.map((row, index) => {
      const showLabel = rows.length <= 8 || index === 0 || index === rows.length - 1 || index % 3 === 0;
      return `<span class="dist-x-label">${showLabel ? esc(row.label) : ""}</span>`;
    }).join("");
    chart.innerHTML = `
      <div class="dist-y-axis" aria-hidden="true">
        <span>${esc(yLabel(axisMax))}</span>
        <span></span>
        <span>${esc(yLabel(axisMax / 2))}</span>
        <span></span>
        <span>0</span>
      </div>
      <div class="dist-plot">${bars}</div>
      <div class="dist-axis-spacer" aria-hidden="true"></div>
      <div class="dist-x-axis" aria-label="时间段">${xLabels}</div>`;
  };

  const renderCost = () => {
    // Cost is an estimate from local token records and the built-in pricing
    // table. The currency toggle only changes display conversion.
    const content = $("costContent");
    if (!content) return;
    $("costPanel")?.toggleAttribute("hidden", !uiState.costVisible);
    if (!uiState.costVisible) return;
    document.querySelectorAll<HTMLElement>(".currency-mode").forEach((button) => {
      const active = button.dataset.currency === uiState.currency;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const cost: any = costSummary || {};
    const parts = cost.parts || [];
    const rows = distributionRows || [];
    const totalCost = Number(cost.total) || 0;
    const hasUsage = rows.some((row) => row.requests || row.total);
    if (!hasUsage) {
      content.innerHTML = `<div class="list-empty">当前范围没有可估算费用的 token 用量</div>`;
      return;
    }
    const partMarkup = parts.map((part) => `
      <div class="cost-part">
        <div class="cost-name"><i class="${esc(part.className)}"></i>${esc(part.name)}</div>
        <div class="cost-value">${esc(money(part.value))}</div>
        <span class="cost-percent">${(part.percent || 0).toFixed(1)}%</span>
      </div>`).join("");
    const stackMarkup = parts.map((part) => {
      const width = totalCost ? Math.max(part.value ? 1.5 : 0, part.value / totalCost * 100) : 0;
      return `<span class="${esc(part.className)}" style="width:${width}%"></span>`;
    }).join("");
    const modelRowsMarkup = (costModelRows || []).filter((row) => row.cost > 0).slice(0, 3).map((row) => `
      <div class="cost-model-row">
        <span class="model-name">${esc(row.name)}</span>
        <span class="bar"><span style="width:${Math.max(4, row.percent || 0)}%"></span></span>
        <span>${esc(moneyCompact(row.cost || 0))}</span>
      </div>`).join("") || `<div class="list-empty">当前范围没有匹配价格的模型</div>`;
    const costBuckets = rows.map((row, index) => ({
      label: row.label,
      cost: Number(row.cost) || 0,
      index,
    }));
    const maxBucket = Math.max(0, ...costBuckets.map((row) => row.cost));
    const peakIndex = costBuckets.reduce((best, row) => row.cost > costBuckets[best].cost ? row.index : best, 0);
    const costBars = costBuckets.map((row) => {
      const height = maxBucket ? Math.max(3, Math.round(row.cost / maxBucket * 100)) : 0;
      return `<span class="${row.index === peakIndex && row.cost ? "cost-peak" : ""}" style="height:${height}%" title="${esc(row.label)} · ${esc(moneyCompact(row.cost))}"></span>`;
    }).join("");
    const firstLabel = costBuckets[0]?.label || "--";
    const lastLabel = costBuckets[costBuckets.length - 1]?.label || "--";
    const fxNote = uiState.currency === "CNY"
      ? `${fxState.source} ${fxState.date}，1 USD≈${fxState.usdCny.toFixed(4)} CNY${fxState.status === "fallback" ? "（离线兜底）" : ""}`
      : "当前显示 USD；切换 CNY 时按 ECB 参考汇率换算。";
    content.innerHTML = `
      <div class="cost-summary">
        <div class="cost-kicker">${uiState.currency === "USD" ? "美元估算" : "人民币换算"}</div>
        <div class="cost-total">${esc(money(cost.total || 0))}</div>
        <div class="cost-stats">
          <div class="cost-stat"><span>单次</span><b>${esc(money(cost.average || 0))}<small>/调用</small></b></div>
          <div class="cost-stat"><span>本区间</span><b>${esc(cost.rangeTokensLabel || "--")}</b></div>
        </div>
      </div>
      <div class="cost-composition">
        <h4 class="cost-subtitle">成本构成</h4>
        <div class="cost-stack" aria-label="成本构成">${stackMarkup}</div>
        <div class="cost-parts">${partMarkup}</div>
      </div>
      <div class="cost-bottom">
        <div>
          <h4 class="cost-mini-title">模型费用排行</h4>
          <div class="cost-model-list">${modelRowsMarkup}</div>
        </div>
        <div class="cost-trend">
          <h4 class="cost-mini-title">费用走势</h4>
          <div class="cost-chart" aria-label="费用走势">${costBars}</div>
          <div class="cost-axis"><span>${esc(firstLabel)}</span><span>${esc(lastLabel)}</span></div>
        </div>
      </div>
      <div class="cost-footnote">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.2 19 6.5v5.2c0 4.4-2.8 7.3-7 9.1-4.2-1.8-7-4.7-7-9.1V6.5l7-3.3Z" stroke="currentColor" stroke-width="1.8"/>
          <path d="m8.8 12.1 2.1 2.1 4.4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>按 OpenAI 官方美元价和本地 token 估算；ChatGPT/Codex 实际账单与额度以官方为准。${esc(fxNote)}</span>
      </div>`;
  };

  const renderOptimization = () => {
    const content = $("optimizationContent");
    if (!content) return;
    const perf = performanceSummary || {};
    const bars = perf.bars || [];
    const models = perf.models || [];
    const hasUsage = bars.some((row) => row.output || row.speed) || Number(summary.requestsLabel || 0) > 0;
    setText("optimizationSummary", `${summary.rangeLabel || "当前范围"} · ${perf.coverageLabel || `${summary.requestsLabel || "0"} 次调用`}`);
    if (!hasUsage) {
      content.innerHTML = `<div class="list-empty">当前范围没有可测速的调用数据</div>`;
      return;
    }

    const maxSpeed = Math.max(1, ...bars.map((row) => row.speed || 0));
    const speedScoreValue = clamp(parseFloat(String(perf.speedScoreLabel || "").replace(/[^\d.]/g, "")));
    const scoreWidth = speedScoreValue > 0 ? Math.max(4, speedScoreValue) : 0;
    const activeSpeedBuckets = bars.filter((row) => row.speed || row.output).length;
    const chartHint = activeSpeedBuckets > 1
      ? `${activeSpeedBuckets} 个时段有输出`
      : "样本集中在单个时段";
    const barMarkup = bars.map((row) => {
      const height = row.speed ? Math.max(8, Math.round(row.speed / maxSpeed * 56)) : 3;
      return `
        <span class="speed-bar" style="--h:${height}px" title="${esc(row.label)} · ${esc(fmtRate(row.speed || 0))}">
          <i>${esc(row.label)}</i>
        </span>`;
    }).join("");
    const modelMarkup = models.map((row) => `
      <div class="speed-model-row">
        <span>${esc(row.name)}</span>
        <strong>${esc(row.firstTokenLabel)}</strong>
        <small>${esc(row.outputLabel)} output · ${esc(row.requests)} 次</small>
      </div>`).join("") || `<div class="list-empty">暂无模型等待数据</div>`;

    content.innerHTML = `
      <div class="speed-hero ${esc(perf.speedTone || "unknown")}">
        <div class="speed-primary">
          <span>体感速度分</span>
          <div class="speed-score-line">
            <strong>${esc(perf.speedScoreLabel || "--")}</strong>
            <b>${esc(perf.speedGrade || "样本不足")}</b>
          </div>
          <small>${esc(perf.speedGrade || "样本不足")} · ${esc(perf.speedReason || "当前范围暂无足够测速样本")}</small>
        </div>
        <div class="speed-status">
          <span>当前判断</span>
          <strong>${esc(perf.speedBandLabel || "越高越顺")}</strong>
          <div class="speed-score-track"><i style="width:${scoreWidth}%"></i></div>
          <small>分数越高，开始等待越短，慢请求越少。</small>
        </div>
      </div>
      <div class="speed-grid">
        <div class="speed-stat">
          <span>开始等待</span>
          <strong>${esc(perf.firstTokenLabel || "--")}</strong>
          <small>平均开始出字 · 大部分不超过 ${esc(perf.p95FirstTokenLabel || "--")}</small>
        </div>
        <div class="speed-stat">
          <span>慢请求</span>
          <strong>${esc(perf.slowRateLabel || "--")}</strong>
          <small>${esc(perf.slowDetailLabel || "没有开始出字样本")}</small>
        </div>
        <div class="speed-stat">
          <span>输出速度</span>
          <strong>${esc(perf.avgOutputPerMinuteLabel || "--")}</strong>
          <small>平均每分钟生成量</small>
        </div>
      </div>
      <div class="speed-bottom">
        <div>
          <div class="speed-section-head">
            <h4>速度变化</h4>
            <span>${esc(chartHint)}</span>
          </div>
          <div class="speed-bars" aria-label="输出速度热度">${barMarkup}</div>
        </div>
        <div>
          <div class="speed-section-head">
            <h4>模型等待</h4>
            <span>${esc(models.length ? `${models.length} 个模型` : "暂无")}</span>
          </div>
          <div class="speed-model-list">${modelMarkup}</div>
          <div class="speed-guide">
            <div><span>80+</span><strong>顺滑</strong></div>
            <div><span>60-80</span><strong>可用</strong></div>
            <div><span>&lt;60</span><strong>偏慢</strong></div>
          </div>
        </div>
      </div>`;
  };

  const renderSparks = () => {
    setPath("requestSpark", sparkPath(distributionRows, "requests", 126, 42));
    setPath("peakSpark", sparkPath(trendRows, "total", 126, 42));
    setPath("cacheSpark", sparkPath(trendRows, "cached", 126, 36));
  };

  const renderAll = () => {
    renderInsights();
    renderChart();
    renderDistribution();
    renderSparks();
    renderProjects();
    renderSessions();
    renderModels();
    renderRisk();
    renderCost();
    renderOptimization();
  };

  const refreshExchangeRate = async () => {
    // Optional display-only FX lookup. Failure keeps the bundled fallback
    // rate and never blocks the dashboard.
    if (!uiState.fxEnabled) {
      fxState.status = "fallback";
      renderCost();
      return;
    }
    try {
      const response = await fetch(EXCHANGE_RATE_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`fx ${response.status}`);
      const payload = await response.json();
      const rate = Number(payload.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("fx invalid");
      fxState.usdCny = rate;
      fxState.date = payload.date || "latest";
      fxState.status = "live";
      renderCost();
    } catch {
      fxState.status = "fallback";
      renderCost();
    }
  };

  const applyPrivacyMode = (value = uiState.privacyMode) => {
    uiState.privacyMode = !!value;
    document.body.classList.toggle("privacy-mode", uiState.privacyMode);
    const privacyToggle = $("privacyToggle");
    const privacySetting = $<HTMLInputElement>("privacySetting");
    if (privacyToggle) {
      privacyToggle.classList.toggle("active", uiState.privacyMode);
      privacyToggle.setAttribute("aria-pressed", String(uiState.privacyMode));
      privacyToggle.textContent = uiState.privacyMode ? "已隐藏" : "隐私";
    }
    if (privacySetting) privacySetting.checked = uiState.privacyMode;
    updateSourceLabels();
    renderInsights();
    renderProjects();
    renderSessions();
    renderOptimization();
  };

  const applyDisplaySettings = () => {
    document.body.classList.toggle("cost-hidden", !uiState.costVisible);
    const costSetting = $<HTMLInputElement>("costSetting");
    const fxSetting = $<HTMLInputElement>("fxSetting");
    if (costSetting) costSetting.checked = uiState.costVisible;
    if (fxSetting) fxSetting.checked = uiState.fxEnabled;
    renderModels();
    renderCost();
    renderOptimization();
  };

  const openSettings = () => {
    $("settingsOverlay")?.removeAttribute("hidden");
    $("settingsDrawer")?.removeAttribute("hidden");
    $("settingsButton")?.setAttribute("aria-expanded", "true");
  };

  const closeSettings = () => {
    $("settingsOverlay")?.setAttribute("hidden", "");
    $("settingsDrawer")?.setAttribute("hidden", "");
    $("settingsButton")?.setAttribute("aria-expanded", "false");
  };

  const applyRange = (preset) => {
    // Central range switch: recompute filtered stats, reset expanded lists,
    // and re-render every dependent panel from local data.
    const custom = preset === "custom";
    $("customRange").hidden = !custom;
    document.querySelectorAll<HTMLElement>(".period-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.range === preset);
    });
    uiState.sessionsExpanded = false;
    uiState.modelsExpanded = false;
    applyStats(computeStats(rangeForPreset(preset)));
    renderAll();
  };

  const availableStart = new Date(firstDataTime || Date.now() - 29 * DAY);
  const availableEnd = new Date(latestDataTime || Date.now());
  const startDateInput = $<HTMLInputElement>("startDate");
  const endDateInput = $<HTMLInputElement>("endDate");
  if (startDateInput && endDateInput) {
    startDateInput.min = ymd(availableStart);
    startDateInput.max = ymd(availableEnd);
    endDateInput.min = ymd(availableStart);
    endDateInput.max = ymd(availableEnd);
    startDateInput.value = ymd(localDayStart(availableEnd));
    endDateInput.value = ymd(localDayStart(availableEnd));
    startDateInput.addEventListener("change", () => applyRange("custom"));
    endDateInput.addEventListener("change", () => applyRange("custom"));
  }
  document.querySelectorAll<HTMLElement>(".period-btn").forEach((button) => {
    button.addEventListener("click", () => applyRange(button.dataset.range || "today"));
  });
  document.querySelectorAll<HTMLElement>(".trend-scale").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.trendScale = button.dataset.trendScale || "linear";
      renderChart();
    });
  });
  document.querySelectorAll<HTMLElement>(".trend-mode").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.trendMode = button.dataset.trendMode === "interval" ? "interval" : "cumulative";
      renderChart();
    });
  });
  document.querySelectorAll<HTMLElement>(".legend-item[data-series]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.series;
      if (!key || !seriesConfig[key]) return;
      const activeCount = Object.values(uiState.trendSeries).filter(Boolean).length;
      if (uiState.trendSeries[key] && activeCount <= 1) return;
      uiState.trendSeries[key] = !uiState.trendSeries[key];
      renderChart();
    });
  });
  document.querySelectorAll<HTMLElement>(".dist-mode").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.distributionMode = button.dataset.distMode || "calls";
      renderDistribution();
    });
  });
  document.querySelectorAll<HTMLElement>(".session-mode").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.sessionMode = button.dataset.sessionMode === "requests" ? "requests" : "tokens";
      uiState.sessionsExpanded = false;
      renderSessions();
    });
  });
  document.querySelectorAll<HTMLElement>(".currency-mode").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.currency = button.dataset.currency === "CNY" ? "CNY" : "USD";
      renderModels();
      renderCost();
      if (uiState.currency === "CNY" && uiState.fxEnabled && fxState.status === "fallback") refreshExchangeRate();
    });
  });
  $("privacyToggle")?.addEventListener("click", () => applyPrivacyMode(!uiState.privacyMode));
  $("settingsButton")?.addEventListener("click", openSettings);
  $("settingsClose")?.addEventListener("click", closeSettings);
  $("settingsOverlay")?.addEventListener("click", closeSettings);
  $<HTMLInputElement>("privacySetting")?.addEventListener("change", (event) => {
    applyPrivacyMode((event.target as HTMLInputElement).checked);
  });
  $<HTMLInputElement>("costSetting")?.addEventListener("change", (event) => {
    uiState.costVisible = (event.target as HTMLInputElement).checked;
    applyDisplaySettings();
  });
  $<HTMLInputElement>("fxSetting")?.addEventListener("change", (event) => {
    uiState.fxEnabled = (event.target as HTMLInputElement).checked;
    if (!uiState.fxEnabled) fxState.status = "fallback";
    applyDisplaySettings();
  });
  const costHelp = $("costHelp");
  const costHelpTip = $("costHelpTip");
  if (costHelp && costHelpTip) {
    costHelpTip.classList.add("cost-popover-floating");
    document.body.appendChild(costHelpTip);
    const setCostHelpOpen = (open) => {
      costHelp.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("cost-help-open", open);
    };
    const closeCostHelp = () => setCostHelpOpen(false);
    costHelp.addEventListener("click", (event) => {
      event.stopPropagation();
      const expanded = costHelp.getAttribute("aria-expanded") === "true";
      setCostHelpOpen(!expanded);
    });
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".cost-help-wrap") && !target?.closest("#costHelpTip")) closeCostHelp();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeCostHelp();
        closeSettings();
      }
    });
  }
  applyRange("today");
  applyPrivacyMode(false);
  applyDisplaySettings();

  $("toggleSessions")?.addEventListener("click", () => {
    uiState.sessionsExpanded = !uiState.sessionsExpanded;
    renderSessions();
  });

  $("toggleModels")?.addEventListener("click", () => {
    uiState.modelsExpanded = !uiState.modelsExpanded;
    renderModels();
  });

  document.querySelectorAll<HTMLElement>(".tab[data-scroll-target]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = $(tab.dataset.scrollTarget);
      if (!target) return;
      document.querySelectorAll<HTMLElement>(".tab").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();
