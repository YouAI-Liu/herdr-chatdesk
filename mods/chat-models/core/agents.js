// What an agent runs on (agent, model, effort, speed, context) and how to start it again with other choices: the
// rules both the window's model menu (lib/agent.js, mods/chat-models) and the web app's use. Reading an agent's own
// settings and restarting it run where each side runs commands (lib/agent.js, service/agents.ts).
export const NAMES = { claude: "Claude Code", codex: "Codex", pi: "Pi", antigravity: "Antigravity" };
export const ALL_AGENTS = ["claude", "codex", "pi", "antigravity"];

// Claude Code's current models, as its /model menu offers them. `id` is what --model gets;
// `match` the names a running agent may report for it.
const CLAUDE_MODELS = [
  { id: "opus", name: "Opus 5.5", match: ["opus", "claude-opus-5-5"] },
  { id: "opus[1m]", name: "Opus 5.5 · 1M", match: ["opus[1m]", "claude-opus-5-5[1m]"] },
  { id: "claude-fable-5-1", name: "Fable 5.1", match: ["fable", "claude-fable-5-1"] },
  { id: "sonnet", name: "Sonnet 5.5", match: ["sonnet", "claude-sonnet-5-5"] },
  { id: "haiku", name: "Haiku 5.5", match: ["haiku", "claude-haiku-5-5"] },
];
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Antigravity (agy) model families from `agy models` (each variant is <id>-<low|medium|high>).
const ANTIGRAVITY_MODELS = [
  { id: "gemini-4-argon", name: "Gemini 4 Argon", efforts: ["low", "medium", "high"], defaultEffort: "high", window: 1000000 },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", efforts: ["low", "medium", "high"], defaultEffort: "high", window: 1000000 },
  // agy doesn't report windows (`agy models` lists names only). Claude 5.5 runs past 200K in agy
  // (logged requests of 227K input / 240K cached went through), so the 1M tier.
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", efforts: ["low", "medium", "high"], defaultEffort: "high", window: 1000000 },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", efforts: ["low", "medium", "high"], defaultEffort: "high", window: 1000000 },
  { id: "gpt-oss-120b", name: "GPT-OSS 120B", efforts: ["medium"], defaultEffort: "medium", window: 128000 },
];
const ANTIGRAVITY_EFFORTS = ["low", "medium", "high"];

function parseAgyModel(raw) {
  if (!raw) return { id: "gemini-4-argon", name: "Gemini 4 Argon", effort: "high" };
  const s = String(raw).trim();
  const paren = /^(.*?)\s*\((Low|Medium|High)\)$/i.exec(s);
  if (paren) {
    const baseName = paren[1].trim();
    const effort = paren[2].toLowerCase();
    const found = ANTIGRAVITY_MODELS.find((m) => m.name.toLowerCase() === baseName.toLowerCase() || m.id === baseName.toLowerCase());
    if (found) return { id: found.id, name: found.name, effort };
  }
  const suffix = /^(.*)-(low|medium|high)$/i.exec(s);
  if (suffix) {
    const baseId = suffix[1].toLowerCase();
    const effort = suffix[2].toLowerCase();
    const found = ANTIGRAVITY_MODELS.find((m) => m.id === baseId);
    if (found) return { id: found.id, name: found.name, effort };
  }
  const exact = ANTIGRAVITY_MODELS.find((m) => m.id === s.toLowerCase() || m.name.toLowerCase() === s.toLowerCase());
  if (exact) return { id: exact.id, name: exact.name, effort: exact.defaultEffort };
  return { id: s, name: s, effort: "high" };
}

// Pi fallback models when models-store.json hasn't been populated yet.
const PI_FALLBACK_MODELS = [
  { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol (openai)", window: 500000 },
  { id: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra (openai)", window: 500000 },
  { id: "openai/gpt-6-astra", label: "GPT-6 Astra (openai)", window: 272000 },
  { id: "openai/gpt-5.4", label: "GPT-5.4 (openai)", window: 400000 },
  { id: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex (openai)", window: 400000 },
  { id: "opencode-go/kimi-k3", label: "Kimi K3 (opencode-go)", window: 1000000 },
  { id: "opencode-go/kimi-k3.1-pro", label: "Kimi K3.1 Pro (opencode-go)", window: 1000000 },
  { id: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (opencode-go)", window: 1000000 },
  { id: "opencode-go/deepseek-v4-pro", label: "DeepSeek V4 Pro (opencode-go)", window: 1000000 },
  { id: "opencode-go/gemini-4-argon", label: "Gemini 4 Argon (opencode-go)", window: 1000000 },
  { id: "opencode-go/glm-5.3", label: "GLM-5.3 (opencode-go)", window: 1000000 },
  { id: "qwen-token-plan-cn/qwen3.8-max", label: "Qwen3.8 Max (qwen)", window: 1000000 },
];
const PI_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

const CODEX_FALLBACK_MODELS = [
  { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: ["low", "medium", "high", "xhigh"], fast: true, defaultEffort: "high", window: 500000 },
  { id: "gpt-6-astra", label: "GPT-6-Astra", efforts: ["low", "medium", "high", "xhigh"], fast: true, defaultEffort: "high", window: 272000 },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", efforts: ["low", "medium", "high", "xhigh"], fast: true, defaultEffort: "high", window: 500000 },
  { id: "gpt-5.4", label: "GPT-5.4", efforts: ["low", "medium", "high", "xhigh"], fast: true, defaultEffort: "high", window: 400000 },
  { id: "gpt-5.3-codex", label: "GPT-5.3-Codex", efforts: ["low", "medium", "high", "xhigh"], fast: true, defaultEffort: "high", window: 400000 },
];

export function windowFor(agent, modelId, dflt = null, metaWindow = null, used = null) {
  const id = String(modelId ?? "").toLowerCase();
  if (agent === "antigravity") {
    const parsed = parseAgyModel(modelId);
    const found = ANTIGRAVITY_MODELS.find((m) => m.id === parsed.id);
    if (found?.window) return found.window;
    if (/gemini/.test(id)) return 1000000;
    if (/claude/.test(id)) return 1000000;
    if (/gpt-oss/.test(id)) return 128000;
    return metaWindow || 1000000;
  }
  if (agent === "claude") {
    // autoCompactWindow in the person's settings: the window Claude Code works within, below the model's own limit.
    const capped = (w) => (dflt?.compactWindow > 0 ? Math.min(w, dflt.compactWindow) : w);
    if (/\[1m\]/.test(id)) return capped(1000000);
    // Claude Code's own model catalog says the real size (DEFAULTS' "windows"), keyed by full id.
    const row = CLAUDE_MODELS.find((m) => (m.match ?? [m.id]).includes(id));
    const full = row ? (row.match.find((x) => x.startsWith("claude-")) ?? row.id) : id;
    if (dflt?.windows?.[full] > 0) return capped(dflt.windows[full]);
    // No catalog cached on that machine: the models in the menu all take 1M.
    if (row) return capped(1000000);
    return capped((used ?? 0) > 200000 ? 1000000 : 200000);
  }
  if (agent === "pi") {
    const list = dflt?.models?.length ? dflt.models : PI_FALLBACK_MODELS;
    const matched = list.find((m) => m.id === modelId || m.shortId === modelId);
    if (matched?.window > 0) return matched.window;
    if (/gemini|deepseek-v4|kimi-k3|glm-5|qwen/.test(id)) return 1000000;
    if (/gpt-6\.1|grok/.test(id)) return 500000;
    if (/gpt-6|gpt-5\.6/.test(id)) return 272000;
    return metaWindow || 200000;
  }
  const codexList = dflt?.models?.length ? dflt.models : CODEX_FALLBACK_MODELS;
  const cm = codexList.find((m) => m.id === modelId);
  if (cm?.window > 0) return cm.window;
  if (/gpt-6\.1/.test(id)) return 500000;
  if (/gpt-6|gpt-5\.6/.test(id)) return 272000;
  if (/gpt-5/.test(id)) return 400000;
  return metaWindow || 500000;
}

// Permission modes as each CLI has them (DSH Chinese labels).
const PERMS = {
  claude: [
    { id: "manual", label: "每次询问" },
    { id: "acceptEdits", label: "工作区内修改" },
    { id: "auto", label: "自动审查" },
    { id: "plan", label: "规划模式" },
    { id: "bypassPermissions", label: "完全权限" },
  ],
  codex: [
    { id: "read-only", label: "仅可查看" },
    { id: "auto", label: "工作区内修改" },
    { id: "full", label: "完全权限" },
  ],
  pi: [
    { id: "auto", label: "完全权限" },
  ],
  antigravity: [
    { id: "accept-edits", label: "工作区内修改" },
    { id: "auto", label: "自动审查" },
    { id: "plan", label: "规划模式" },
    { id: "bypassPermissions", label: "完全权限" },
  ],
};

// What a permission mode is called for the agent it belongs to: "auto" is a different mode in each CLI.
export function permLabel(agent, perm) {
  if (!perm) return null;
  return PERMS[agent]?.find((p) => p.id === perm)?.label ?? (perm === "dontAsk" ? "不询问" : perm);
}

// What a model id says, in words: "claude-opus-5-5" → "Opus 5.5", "opus[1m]" → "Opus 1M".
export function modelName(id) {
  if (!id) return null;
  const agy = ANTIGRAVITY_MODELS.find((m) => m.id === id);
  if (agy) return agy.name;
  const agyParsed = /^(gemini-4-argon|gemini-3\.8-flash|claude-opus-5-5|claude-sonnet-5-5|gpt-oss-120b)-(low|medium|high)$/i.exec(id);
  if (agyParsed) return parseAgyModel(id).name;
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/.exec(id);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}`;
  const a = /^([a-z]+)(\[1m\])?$/.exec(id);
  if (a) return `${a[1][0].toUpperCase()}${a[1].slice(1)}${a[2] ? " 1M" : ""}`;
  return id;
}

// A flag's value in argv: --model x, --model=x, or -m x.
function flag(argv, ...names) {
  for (let i = argv.length - 1; i >= 0; i--) {
    for (const n of names) {
      if (argv[i] === n && i + 1 < argv.length) return argv[i + 1];
      if (argv[i].startsWith(n + "=")) return argv[i].slice(n.length + 1);
    }
  }
  return null;
}
// Codex's -c key=value overrides.
function overrides(argv) {
  const out = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] !== "-c" && argv[i] !== "--config") continue;
    const m = /^([\w.]+)=(.*)$/.exec(argv[i + 1]);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// The agent's own settings on its machine. Read once per agent process.
export const DEFAULTS = `
if [ "$1" = claude ]; then
  f="$HOME/.claude/settings.json"
  command -v jq >/dev/null && [ -f "$f" ] && jq -r '"model\\t\\(.model // "")", "effort\\t\\(.effortLevel // "")", "fast\\t\\(if .fastMode == true then "on" else "" end)", "per\\t\\(.modelSettings // {} | with_entries(.value |= (.effortLevel // null)) | tojson)", "mode\\t\\(.permissions.defaultMode // "")", "compact\\t\\(.autoCompactWindow // "")"' "$f" 2>/dev/null
  c=$(ls -t "$HOME"/.claude/cache/model-catalog/*.json 2>/dev/null | head -1)
  command -v jq >/dev/null && [ -n "$c" ] && { printf 'windows\\t'; jq -c '[.catalog.config.models[]? | select(.id and .runtime.max_input_tokens) | {key: .id, value: .runtime.max_input_tokens}] | from_entries' "$c" 2>/dev/null; printf 'efforts\\t'; jq -c '[.catalog.config.models[]? | select(.id and .runtime.default_effort) | {key: .id, value: .runtime.default_effort}] | from_entries' "$c" 2>/dev/null; }
elif [ "$1" = pi ]; then
  f="$HOME/.pi/agent/settings.json"
  command -v jq >/dev/null && [ -f "$f" ] && jq -r '"provider\\t\\(.defaultProvider // "")", "model\\t\\(.defaultModel // "")", "effort\\t\\(.defaultThinkingLevel // "")"' "$f" 2>/dev/null
  s="$HOME/.pi/agent/models-store.json"
  command -v jq >/dev/null && [ -f "$s" ] && { printf 'pi_models\\t'; jq -c '[to_entries[] | .key as $p | (.value.models // .value | to_entries[]?) | {id: "\\($p)/\\(.value.id // .key)", shortId: (.value.id // .key), label: "\\(.value.name // .value.id // .key) (\\($p))", window: (.value.contextWindow // .value.context_window // .value.limit.context // null)}]' "$s" 2>/dev/null; echo; }
elif [ "$1" = antigravity ]; then
  f="$HOME/.gemini/antigravity-cli/settings.json"
  command -v jq >/dev/null && [ -f "$f" ] && jq -r '"model\\t\\(.model // "")", "mode\\t\\(.toolPermission // "")"' "$f" 2>/dev/null
elif [ "$1" = codex ]; then
  f="$HOME/.codex/config.toml"
  for k in model model_reasoning_effort service_tier sandbox_mode approval_policy; do
    printf '%s\\t%s\\n' "$k" "$(sed -n "s/^$k[[:space:]]*=[[:space:]]*\\"\\{0,1\\}\\([^\\"]*\\)\\"\\{0,1\\}.*/\\1/p" "$f" 2>/dev/null | head -1)"
  done
  c="$HOME/.codex/models_cache.json"
  [ -f "$c" ] && { printf 'models\\t'; tr -d '\\n' < "$c"; echo; }
fi
true`;

function parsePer(text) {
  try { return JSON.parse(text || "{}") ?? {}; } catch { return {}; }
}

// The agent's own settings, from DEFAULTS' output on its machine.
export function parseDefaults(kind, stdout) {
  const out = {};
  for (const line of (stdout ?? "").split("\n")) {
    const t = line.indexOf("\t");
    if (t > 0) out[line.slice(0, t)] = line.slice(t + 1);
  }
  let models = null;
  if (out.models) {
    try {
      models = (JSON.parse(out.models).models ?? []).filter((m) => m.visibility !== "hide").map((m) => ({
        id: m.slug, label: m.display_name || m.slug,
        efforts: (m.supported_reasoning_levels ?? []).map((l) => l.effort).filter(Boolean),
        fast: (m.service_tiers ?? []).length > 0,
        defaultEffort: m.default_reasoning_level ?? null,
        // What Codex itself counts against (its logs' model_context_window): the usable share of the window.
        window: m.context_window ? Math.round(m.context_window * (m.effective_context_window_percent ?? 100) / 100) : null,
      }));
    } catch {}
  }
  if (kind === "claude") return { model: out.model || null, effort: out.effort || null, fast: Boolean(out.fast), per: parsePer(out.per), mode: out.mode || null, windows: parsePer(out.windows), efforts: parsePer(out.efforts), compactWindow: Number(out.compact) || null };
  if (kind === "pi") {
    let piModels = null;
    if (out.pi_models) {
      try { piModels = JSON.parse(out.pi_models); } catch {}
    }
    const rawModel = out.model || null;
    const fullModel = rawModel && out.provider && !rawModel.includes("/") ? `${out.provider}/${rawModel}` : rawModel;
    return { model: fullModel || rawModel || "openai/gpt-6.1-sol", rawModel, provider: out.provider || null, effort: out.effort || "high", models: piModels };
  }
  if (kind === "antigravity") {
    const parsed = parseAgyModel(out.model || "Gemini 4 Argon (High)");
    const perm = out.mode === "always-proceed" ? "bypassPermissions" : "auto";
    return { model: parsed.id, effort: parsed.effort, mode: perm };
  }
  return { model: out.model || null, effort: out.model_reasoning_effort || null, fast: ["fast", "priority"].includes(out.service_tier),
    sandbox: out.sandbox_mode || null, approval: out.approval_policy || null, models };
}

// What the agent runs on now: { agent, model, effort, fast, used, window, alias }.
export function current(kind, argv, meta, dflt) {
  argv = argv ?? [];
  meta = meta ?? {};
  dflt = dflt ?? {};
  if (kind === "pi") {
    const raw = meta.model ?? flag(argv, "-m", "--model") ?? dflt.model ?? "openai/gpt-6.1-sol";
    const matched = (dflt.models ?? PI_FALLBACK_MODELS).find((m) => m.id === raw || m.shortId === raw);
    const model = matched ? matched.id : raw;
    return {
      agent: "pi",
      model,
      label: matched?.label ?? raw,
      effort: meta.effort ?? flag(argv, "--thinking") ?? dflt.effort ?? "high",
      fast: false,
      perm: "auto",
      used: meta.used ?? null,
      window: windowFor("pi", model, dflt, meta.window, meta.used),
    };
  }
  if (kind === "antigravity") {
    const metaModel = meta.model && meta.model !== "antigravity" ? meta.model : null;
    const raw = flag(argv, "-m", "--model") ?? metaModel ?? dflt.model ?? "gemini-4-argon";
    const parsed = parseAgyModel(raw);
    const mObj = ANTIGRAVITY_MODELS.find((m) => m.id === parsed.id);
    const allowed = mObj?.efforts ?? ANTIGRAVITY_EFFORTS;
    const flagEffort = flag(argv, "--effort");
    const rawEffort = (flagEffort && allowed.includes(flagEffort) ? flagEffort : null) ?? parsed.effort ?? dflt.effort ?? "high";
    const effort = allowed.includes(rawEffort) ? rawEffort : (mObj?.defaultEffort ?? "high");
    const perm = argv.includes("--dangerously-skip-permissions")
      ? "bypassPermissions"
      : flag(argv, "--mode") ?? dflt.mode ?? "auto";
    return {
      agent: "antigravity",
      model: parsed.id,
      label: parsed.name,
      effort,
      fast: false,
      perm,
      used: meta.used ?? null,
      window: windowFor("antigravity", parsed.id, dflt, meta.window, meta.used),
    };
  }
  if (kind === "claude") {
    const alias = flag(argv, "--model") ?? dflt.model;
    let fast = dflt.fast;
    const s = flag(argv, "--settings");
    if (s && /"fastMode"\s*:\s*(true|false)/.test(s)) fast = /"fastMode"\s*:\s*true/.test(s);
    if (meta.speed) fast = meta.speed === "fast";
    const per = meta.model ? dflt.per?.[meta.model] ?? dflt.per?.[meta.model.replace(/-\d+$/, "")] : null;
    const perm = meta.perm ?? (argv.includes("--dangerously-skip-permissions") ? "bypassPermissions" : flag(argv, "--permission-mode") ?? dflt.mode ?? "manual");
    const chosen = meta.model ?? alias;
    return { agent: "claude", model: chosen, alias, effort: meta.effort ?? flag(argv, "--effort") ?? per ?? dflt.effort,
      fast: Boolean(fast), perm: perm === "default" ? "manual" : perm, used: meta.used ?? null,
      window: windowFor("claude", /\[1m\]/.test(alias ?? "") ? alias : chosen ?? alias, dflt, meta.window, meta.used) };
  }
  const o = overrides(argv);
  const tier = o.service_tier;
  const model = meta.model ?? flag(argv, "-m", "--model") ?? o.model ?? dflt.model ?? "gpt-6.1-sol";
  const sandbox = flag(argv, "-s", "--sandbox") ?? o.sandbox_mode ?? dflt.sandbox;
  const perm = argv.includes("--dangerously-bypass-approvals-and-sandbox") || sandbox === "danger-full-access" ? "full"
    : sandbox === "read-only" ? "read-only" : "auto";
  const codexModels = dflt.models?.length ? dflt.models : CODEX_FALLBACK_MODELS;
  return { agent: "codex", model, label: codexModels.find((m) => m.id === model)?.label ?? null, perm,
    effort: meta.effort ?? o.model_reasoning_effort ?? dflt.effort,
    fast: tier ? ["fast", "priority"].includes(tier) : Boolean(dflt.fast), used: meta.used ?? null,
    window: windowFor("codex", model, dflt, meta.window, meta.used) };
}

// An effort level as the person reads it: "xhigh" -> "Extra high". The CLIs still get the raw value.
const LEVELS = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra", none: "None" };
export function levelName(e) {
  return e ? LEVELS[e] ?? e[0].toUpperCase() + e.slice(1) : null;
}

// "Claude Code · Opus 5.5 · High · Fast"
export function line(c) {
  if (!c) return "";
  return [NAMES[c.agent], c.label ?? modelName(c.model), levelName(c.effort), c.fast ? "Fast" : null].filter(Boolean).join(" · ");
}

export function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 990000) {
    const m = n / 1000000;
    const rounded = Math.round(m * 10) / 10;
    return `${Math.abs(rounded - Math.round(rounded)) < 0.08 ? Math.round(rounded) : rounded}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(Math.round(n));
}

// How full the context window is: "12% · 124K / 1M" or "0% · 1M".
export function contextWords(c) {
  if (!c?.window) return null;
  const winStr = formatTokens(c.window);
  if (!c.used || c.used <= 0) return `0% · ${winStr}`;
  const pct = Math.min(100, Math.round((c.used / c.window) * 100));
  return `${pct}% · ${formatTokens(c.used)} / ${winStr}`;
}

// What the model picker (mods/chat-models, the web's restart.tsx) shows for one agent, as plain data:
// { name, models: [{ id, name, efforts, defaultEffort, fast }], perms }.
export function menuFor(agent, dflt, current = null) {
  if (agent === "claude") {
    const models = CLAUDE_MODELS.map((m) => ({ id: m.id, name: m.name, efforts: CLAUDE_EFFORTS,
      defaultEffort: dflt?.per?.[m.match[1].replace(/\[1m\]$/, "")] ?? dflt?.effort ?? dflt?.efforts?.[m.match[1].replace(/\[1m\]$/, "")] ?? "high", fast: m.id.startsWith("opus") }));
    if (current && !models.some((m) => m.id === current)) models.unshift({ id: current, name: modelName(current), efforts: CLAUDE_EFFORTS, defaultEffort: dflt?.effort ?? "high", fast: false });
    return { name: NAMES.claude, perms: PERMS.claude, models };
  }
  if (agent === "pi") {
    const rawList = dflt?.models?.length ? dflt.models : PI_FALLBACK_MODELS;
    const models = rawList.map((m) => ({
      id: m.id,
      name: m.label || m.id,
      efforts: PI_EFFORTS,
      defaultEffort: dflt?.effort ?? "high",
      fast: false,
    }));
    if (current && !models.some((m) => m.id === current)) {
      models.unshift({ id: current, name: current, efforts: PI_EFFORTS, defaultEffort: dflt?.effort ?? "high", fast: false });
    }
    return { name: NAMES.pi, perms: PERMS.pi, models };
  }
  if (agent === "antigravity") {
    const models = ANTIGRAVITY_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      efforts: m.efforts,
      defaultEffort: m.defaultEffort ?? dflt?.effort ?? "high",
      fast: false,
    }));
    if (current && !models.some((m) => m.id === current)) {
      models.unshift({ id: current, name: modelName(current), efforts: ANTIGRAVITY_EFFORTS, defaultEffort: dflt?.effort ?? "high", fast: false });
    }
    return { name: NAMES.antigravity, perms: PERMS.antigravity, models };
  }
  const src = dflt?.models?.length ? dflt.models : CODEX_FALLBACK_MODELS;
  const all = src.map((m) => ({ id: m.id, name: m.label, efforts: m.efforts?.length ? m.efforts : ["low", "medium", "high", "xhigh"],
    defaultEffort: m.defaultEffort ?? dflt?.effort ?? "high", fast: m.fast }));
  if (current && !all.some((m) => m.id === current)) all.unshift({ id: current, name: current, efforts: ["low", "medium", "high", "xhigh"], defaultEffort: dflt?.effort ?? "high", fast: false });
  return { name: NAMES.codex, perms: PERMS.codex, models: all };
}

// The levels a model typed by id gets: its agent's usual ones.
export function typedModel(agent, id) {
  const efforts = agent === "claude" ? CLAUDE_EFFORTS : agent === "pi" ? PI_EFFORTS : agent === "antigravity" ? ANTIGRAVITY_EFFORTS : ["low", "medium", "high", "xhigh"];
  return { id, name: agent === "claude" || agent === "antigravity" ? modelName(id) : id, efforts, defaultEffort: "high", fast: false, typed: true };
}

export const PICKS_FILE = ".herdr/model-picks.json";
const RECENT = 5;
export const pickKey = (agent, id) => `${agent}:${id}`;
export function parsePicks(text) {
  let d = {};
  try { d = JSON.parse(text || "{}") ?? {}; } catch {}
  const list = (x) => (Array.isArray(x) ? x.filter((k) => typeof k === "string" && k.includes(":")) : []);
  return { pinned: list(d.pinned), recent: list(d.recent).slice(0, RECENT) };
}
export function withRecent(picks, key) {
  return { ...picks, recent: [key, ...picks.recent.filter((k) => k !== key)].slice(0, RECENT) };
}
export function withPin(picks, key) {
  return { ...picks, pinned: picks.pinned.includes(key) ? picks.pinned.filter((k) => k !== key) : [...picks.pinned, key] };
}

export function modelMatches(m, q) {
  const hay = `${m.name ?? ""} ${m.id}`.toLowerCase().replace(/[^a-z0-9.\[\]/ -]+/g, " ");
  return String(q ?? "").toLowerCase().split(/[^a-z0-9.\[\]/-]+/).filter(Boolean).every((w) => hay.includes(w));
}

export const CAP = 200;
export function modelSections(menus, agent, picks, q) {
  picks = picks ?? { pinned: [], recent: [] };
  const query = String(q ?? "").trim();
  const order = (k, models) => {
    const rank = (m) => {
      const key = pickKey(k, m.id), p = picks.pinned.indexOf(key), r = picks.recent.indexOf(key);
      return p >= 0 ? p : r >= 0 ? 1000 + r : 2000;
    };
    return models.map((m, i) => ({ m, i, r: rank(m) })).sort((a, b) => a.r - b.r || a.i - b.i)
      .map(({ m }) => ({ agent: k, ...m, pinned: picks.pinned.includes(pickKey(k, m.id)) }));
  };
  const saved = (k) => {
    const models = menus?.[k]?.models ?? [], known = new Set(models.map((m) => m.id));
    const ids = [...new Set([...picks.pinned, ...picks.recent].filter((x) => x.startsWith(`${k}:`)).map((x) => x.slice(k.length + 1)))];
    return [...models, ...ids.filter((id) => !known.has(id)).map((id) => ({ ...typedModel(k, id), typed: false }))];
  };
  const capped = (key, title, k, rows) => ({ key, title, agent: k, rows: rows.slice(0, CAP), more: Math.max(0, rows.length - CAP) });
  if (!query) {
    const rows = order(agent, saved(agent));
    const pinned = rows.filter((r) => r.pinned);
    const recent = rows.filter((r) => !r.pinned && picks.recent.includes(pickKey(agent, r.id)));
    const rest = rows.filter((r) => !r.pinned && !picks.recent.includes(pickKey(agent, r.id)));
    return [
      ...(pinned.length ? [capped("pinned", "Pinned", agent, pinned)] : []),
      ...(recent.length ? [capped("recent", "Recent", agent, recent)] : []),
      ...(rest.length ? [capped("all", pinned.length || recent.length ? "All models" : "Models", agent, rest)] : []),
    ];
  }
  const out = [];
  for (const k of [agent, ...Object.keys(menus ?? {}).filter((x) => x !== agent)]) {
    const m = menus?.[k];
    if (!m) continue;
    const rows = order(k, saved(k).filter((x) => modelMatches(x, query)));
    if (rows.length) out.push(capped(k, m.name, k, rows));
  }
  if (/^[\w.\[\]/-]{2,60}$/.test(query)) {
    const rows = [agent, ...Object.keys(menus ?? {}).filter((x) => x !== agent)]
      .filter((k) => menus?.[k] && !saved(k).some((m) => m.id === query)).map((k) => ({ agent: k, ...typedModel(k, query), pinned: false }));
    if (rows.length) out.push({ key: "typed", title: "Use the id typed", agent, rows, more: 0 });
  }
  return out;
}

// The picker row that is what runs now (`c` from current()), or the model as it is.
export function rowFor(agent, c) {
  if (agent === "antigravity") {
    const parsed = parseAgyModel(c?.model);
    const found = ANTIGRAVITY_MODELS.find((m) => m.id === parsed.id);
    return found?.id ?? parsed.id ?? "gemini-4-argon";
  }
  if (agent !== "claude") return c?.model ?? null;
  const has = (m, x) => (m.match ?? [m.id]).includes(x);
  const byAlias = c?.alias ? CLAUDE_MODELS.find((m) => has(m, c.alias)) : null;
  const byModel = c?.model ? CLAUDE_MODELS.find((m) => has(m, c.model)) : null;
  const same = byAlias && (!c?.model || (byAlias.match ?? [byAlias.id]).some((x) => x.replace(/\[1m\]$/, "") === c.model));
  return (same ? byAlias : byModel ?? byAlias)?.id ?? c?.model ?? null;
}

const CLAUDE_DROP = new Set(["--model", "--effort", "--settings", "--session-id", "--resume", "-r", "--permission-mode"]);
const CLAUDE_BARE = new Set(["--continue", "-c", "--fork-session", "--dangerously-skip-permissions"]);
const CLAUDE_VALUE = new Set(["--add-dir", "--mcp-config", "--append-system-prompt", "--system-prompt",
  "--allowedTools", "--allowed-tools", "--disallowedTools", "--disallowed-tools", "--agent", "--agents", "--plugin-dir",
  "--fallback-model", "--output-format", "--input-format", "--name", "--setting-sources", "--betas", "--debug-file"]);
const CODEX_VALUE = new Set(["-c", "--config", "-m", "--model", "-p", "--profile", "-s", "--sandbox", "-a", "--ask-for-approval",
  "-C", "--cd", "--add-dir", "-i", "--image", "--enable", "--disable", "--local-provider", "--oss"]);
const PI_DROP = new Set(["--model", "-m", "--provider", "--thinking", "--session", "--session-id", "--resume", "-r", "--fork"]);
const PI_BARE = new Set(["--continue", "-c"]);
// -i carries the first prompt: kept without it, it would take the next flag as its value.
const AGY_DROP = new Set(["--model", "-m", "--effort", "--mode", "--conversation", "--settings", "-i", "--prompt-interactive"]);
const AGY_BARE = new Set(["--continue", "-c", "--dangerously-skip-permissions"]);
const AGY_VALUE = new Set(["--add-dir", "--agent", "--project", "--log-file"]);

function kept(kind, argv) {
  const out = [];
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (kind === "claude") {
      if (CLAUDE_BARE.has(a)) continue;
      if (CLAUDE_DROP.has(a)) { if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if ([...CLAUDE_DROP].some((f) => a.startsWith(f + "="))) continue;
      if (CLAUDE_VALUE.has(a)) { out.push(a, rest[++i]); continue; }
      if (a.startsWith("-")) out.push(a);
    } else if (kind === "pi") {
      if (PI_BARE.has(a)) continue;
      if (PI_DROP.has(a)) { if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if ([...PI_DROP].some((f) => a.startsWith(f + "="))) continue;
      if (a.startsWith("-")) out.push(a);
    } else if (kind === "antigravity") {
      if (AGY_BARE.has(a)) continue;
      if (AGY_DROP.has(a)) { if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if ([...AGY_DROP].some((f) => a.startsWith(f + "="))) continue;
      if (AGY_VALUE.has(a)) { out.push(a, rest[++i]); continue; }
      if (a.startsWith("-")) out.push(a);
    } else {
      if (i === 0 && (a === "resume" || a === "fork")) { if (rest[1] && !rest[1].startsWith("-")) i++; continue; }
      if (a === "--no-daemon" || a === "--dangerously-bypass-approvals-and-sandbox" || a === "--full-auto") continue;
      if (["-m", "--model", "-s", "--sandbox", "-a", "--ask-for-approval"].includes(a)) { i++; continue; }
      if ((a === "-c" || a === "--config") && /^(model|model_reasoning_effort|service_tier)=/.test(rest[i + 1] ?? "")) { i++; continue; }
      if (CODEX_VALUE.has(a)) { out.push(a, rest[++i]); continue; }
      if (a.startsWith("-")) out.push(a);
    }
  }
  return out.filter((x) => x !== undefined);
}

export function freshArgv(kind, argv) {
  argv = argv ?? [];
  const at = argv.findIndex((a, i) => (i === 0 || !a.startsWith("-")) && /^(claude|codex|pi|agy|antigravity)$/.test(String(a).split("/").pop()));
  if (at < 0) return null;
  const rest = argv.slice(at + 1), out = [argv[at]];
  let resumed = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (kind === "claude") {
      if (a === "--resume" || a === "-r" || a === "--session-id") { resumed ||= a !== "--session-id"; if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if (/^--(resume|session-id)=/.test(a)) { resumed ||= a.startsWith("--resume"); continue; }
      if (a === "--continue" || a === "-c") { resumed = true; continue; }
      if (a === "--fork-session") continue;
      if (CLAUDE_VALUE.has(a) || ["--model", "--effort", "--settings", "--permission-mode"].includes(a)) { out.push(a, rest[++i]); continue; }
    } else if (kind === "pi") {
      if (a === "--session" || a === "--session-id" || a === "--resume" || a === "-r") { resumed = true; if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if (a === "--continue" || a === "-c") { resumed = true; continue; }
    } else if (kind === "antigravity") {
      if (a === "--conversation") { resumed = true; if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if (a === "--continue" || a === "-c") { resumed = true; continue; }
      if (a === "-i" || a === "--prompt-interactive") { if (rest[i + 1] && !rest[i + 1].startsWith("-")) i++; continue; }
      if (AGY_VALUE.has(a) || ["--model", "--mode", "--effort", "--settings"].includes(a)) { out.push(a, rest[++i]); continue; }
    } else {
      if (i === 0 && (a === "resume" || a === "fork")) { resumed = true; continue; }
      if (a === "--last") continue;
      if (CODEX_VALUE.has(a)) { out.push(a, rest[++i]); continue; }
    }
    if (a.startsWith("-")) out.push(a);
  }
  return resumed ? out.filter((x) => x !== undefined) : null;
}

// How to start the chosen agent: { argv, resume } (resume: argv already continues the session).
export function argvFor(pick, old) {
  const same = pick.agent === old.agent;
  const flags = same ? kept(pick.agent, old.argv ?? []) : [];
  if (pick.agent === "claude") {
    const a = ["claude", ...flags];
    if (pick.model) a.push("--model", pick.model);
    if (pick.effort) a.push("--effort", pick.effort);
    a.push("--settings", JSON.stringify({ fastMode: Boolean(pick.fast) }));
    if (pick.perm === "bypassPermissions") a.push("--dangerously-skip-permissions");
    else if (pick.perm) a.push("--permission-mode", pick.perm === "manual" ? "default" : pick.perm);
    if (same && old.session) return { argv: [...a, "--resume", old.session], resume: true, base: a };
    return { argv: a, resume: false, base: a };
  }
  if (pick.agent === "pi") {
    const a = ["pi", ...flags];
    if (pick.model) a.push("--model", pick.model);
    if (pick.effort) a.push("--thinking", pick.effort);
    if (same && old.session) return { argv: [...a, "--session", old.session], resume: true, base: a };
    return { argv: a, resume: false, base: a };
  }
  if (pick.agent === "antigravity") {
    const a = ["agy", ...flags];
    if (pick.model) {
      const mObj = ANTIGRAVITY_MODELS.find((m) => m.id === pick.model);
      const eff = pick.effort || mObj?.defaultEffort || "high";
      const fullModel = mObj && !/-(low|medium|high)$/i.test(pick.model) ? `${pick.model}-${eff}` : pick.model;
      a.push("--model", fullModel);
    }
    if (pick.perm === "bypassPermissions") a.push("--dangerously-skip-permissions");
    else if (pick.perm) a.push("--mode", pick.perm);
    if (same && old.session) return { argv: [...a, "--conversation", old.session], resume: true, base: a };
    return { argv: a, resume: false, base: a };
  }
  const a = [...flags, "--no-daemon"];
  if (pick.model) a.push("-m", pick.model);
  if (pick.effort) a.push("-c", `model_reasoning_effort="${pick.effort}"`);
  a.push("-c", `service_tier="${pick.fast ? "fast" : "default"}"`);
  if (pick.perm === "full") a.push("--dangerously-bypass-approvals-and-sandbox");
  else if (pick.perm === "read-only") a.push("-s", "read-only", "-a", "on-request");
  else if (pick.perm) a.push("-s", "workspace-write", "-a", "on-request");
  if (same && old.session) return { argv: ["codex", "resume", ...a, old.session], resume: true, base: ["codex", ...a] };
  return { argv: ["codex", ...a], resume: false, base: ["codex", ...a] };
}

// The conversation's id, from its log's file name.
export function sessionOf(kind, path) {
  if (!path) return null;
  if (kind === "pi") return path.endsWith(".jsonl") ? path : null;
  if (kind === "antigravity") {
    const m = /\/brain\/([0-9a-f-]{36})\//.exec(path);
    return m ? m[1] : null;
  }
  const m = kind === "claude" ? /([0-9a-f-]{36})\.jsonl$/.exec(path) : /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(path);
  return m ? m[1] : null;
}

// A copy of the conversation in a new tab beside this one, through the CLI's own fork.
export function forkArgv(kind, argv, session) {
  argv = argv ?? [];
  if (kind === "pi") {
    const m = flag(argv, "-m", "--model"), th = flag(argv, "--thinking");
    return ["pi", ...kept(kind, argv), ...(m ? ["--model", m] : []), ...(th ? ["--thinking", th] : []), "--fork", session];
  }
  if (kind === "antigravity") {
    const m = flag(argv, "-m", "--model"), ef = flag(argv, "--effort");
    return ["agy", ...kept(kind, argv), ...(m ? ["--model", m] : []), ...(ef ? ["--effort", ef] : []), "--conversation", session];
  }
  // A copy runs with the permissions of the conversation it was copied from.
  const same = kind === "claude"
    ? [...["--model", "--effort", "--settings", "--permission-mode"].flatMap((f) => { const v = flag(argv, f); return v ? [f, v] : []; }),
      ...(argv.includes("--dangerously-skip-permissions") ? ["--dangerously-skip-permissions"] : [])]
    : (() => {
      const m = flag(argv, "-m", "--model"), o = overrides(argv), s = flag(argv, "-s", "--sandbox"), ap = flag(argv, "-a", "--ask-for-approval");
      return [...(m ? ["-m", m] : []), "--no-daemon",
        ...["model_reasoning_effort", "service_tier"].flatMap((k) => (o[k] ? ["-c", `${k}="${o[k]}"`] : [])),
        ...(argv.includes("--dangerously-bypass-approvals-and-sandbox") ? ["--dangerously-bypass-approvals-and-sandbox"] : []),
        ...(s ? ["-s", s] : []), ...(ap ? ["-a", ap] : [])];
    })();
  const flags = [...kept(kind, argv), ...same];
  return kind === "claude" ? ["claude", ...flags, "--resume", session, "--fork-session"] : ["codex", "fork", ...flags, session];
}
