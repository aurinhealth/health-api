const MCP_PROTOCOL_VERSION = "2025-11-25";
const SERVER_VERSION = "1.0.0";
const DEMO_API_KEY = "health-strength-demo-2026";

const TOOLS = [
  {
    name: "getStrengthContext",
    title: "Get strength training context",
    description: "Read the integrated training context for a date, including recent and planned cycling load, recovery data, and strength history context. Read-only.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "Optional workout date in YYYY-MM-DD format." } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "getStrengthHistory",
    title: "Get completed strength history",
    description: "Read completed strength-training sets from D1. Read-only.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 500, default: 100, description: "Maximum number of completed rows to return." } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "getTodayStrengthSheet",
    title: "Read today's strength sheet",
    description: "Read the current Dnešní trénink Google Sheet contents. Read-only.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "generateStrengthPlan",
    title: "Generate today's strength workout",
    description: "Generate an adaptive strength workout from cycling load, recovery, and strength history, then write it to the Google Sheet. Set preview=true to calculate without writing.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "Optional workout date in YYYY-MM-DD format." }, preview: { type: "boolean", default: false, description: "If true, calculate the plan without writing it to the sheet." } } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "syncStrengthSheet",
    title: "Sync completed strength sets",
    description: "Read the current Google Sheet and sync completed strength sets into D1 for future progression. This changes D1 state.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "analyzeStrengthWorkout",
    title: "Analyze completed strength workout",
    description: "Sync the current sheet and analyze the completed strength workout using the stored strength history.",
    inputSchema: { type: "object", properties: { command: { type: "string", description: "Optional analysis command or user instruction." } } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "findStrengthAlternatives",
    title: "Find exercise alternatives",
    description: "Find suitable strength-exercise alternatives using the active exercise catalogue and training history. Read-only.",
    inputSchema: { type: "object", properties: { exercise: { type: "string", description: "Exercise to replace." }, muscle: { type: "string", description: "Optional target muscle or muscle group." } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  {
    name: "substituteStrengthExercise",
    title: "Substitute today's exercise",
    description: "Replace an exercise in today's Google Sheet workout with another exercise from the active catalogue.",
    inputSchema: { type: "object", required: ["from"], properties: { from: { type: "string", description: "Exercise currently in today's workout." }, to: { type: "string", description: "Replacement exercise from the active catalogue." }, muscle: { type: "string", description: "Optional target muscle used to select a replacement when to is omitted." } } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
];

export async function handleMcp(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && !isAllowedOrigin(origin)) return new Response("Forbidden", { status: 403 });
  if (request.method === "GET") return new Response(null, { status: 405, headers: { Allow: "POST, GET" } });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, GET" } });

  const expectedKey = env.MCP_API_KEY || env.STRENGTH_API_KEY;
  if (!expectedKey) return json({ jsonrpc: "2.0", error: { code: -32603, message: "MCP authentication is not configured" } }, 500);
  const authorization = request.headers.get("Authorization") || "";
  const demoMode = authorization === `Bearer ${DEMO_API_KEY}`;
  if (!demoMode && authorization !== `Bearer ${expectedKey}`) return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="health-api-mcp"' } });

  let message;
  try { message = await request.json(); } catch { return json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }, 400); }
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return json({ jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32600, message: "Invalid Request" } }, 400);

  const protocolHeader = request.headers.get("MCP-Protocol-Version");
  if (message.method !== "initialize" && protocolHeader && !isSupportedProtocol(protocolHeader)) return json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32602, message: "Unsupported MCP protocol version" } }, 400);

  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    const protocolVersion = isSupportedProtocol(requested) ? requested : MCP_PROTOCOL_VERSION;
    return json({ jsonrpc: "2.0", id: message.id, result: { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "health-api-strength-coach", title: "Health API Strength Coach", version: SERVER_VERSION, description: "Adaptive strength-training tools backed by the user's health-api service." }, instructions: "Use the strength context and completed strength history before generating a workout. generateStrengthPlan writes the adaptive workout to the user's Google Sheet unless preview=true." } });
  }

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled" || message.method === "ping") {
    if (message.id === undefined) return new Response(null, { status: 202 });
    return json({ jsonrpc: "2.0", id: message.id, result: {} });
  }

  if (message.method === "tools/list") return json({ jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const tool = TOOLS.find((item) => item.name === name);
    if (!tool) return json({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: `Unknown tool: ${name}` } }, 400);
    try {
      const result = demoMode ? demoTool(name, args) : await callHealthApi(request, env, name, args);
      return json({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
    } catch (error) {
      return json({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] } });
    }
  }

  return json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: `Method not found: ${message.method}` } }, 404);
}

function isSupportedProtocol(value) { return value === "2025-11-25" || value === "2025-06-18"; }

function isAllowedOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && ["chatgpt.com", "chat.openai.com", "platform.openai.com"].includes(url.hostname);
  } catch { return false; }
}

function demoTool(name, args) {
  const date = String(args.date || "2026-09-17");
  if (name === "getStrengthContext") return { status: "ok", date, demo: true, recentCycling: [{ date: "2026-09-15", name: "Sweet Spot Intervals", hours: 1, tss: 105 }], plannedCycling: [{ date: "2026-09-18", name: "Easy Endurance", hours: 1, tss: 34 }], recovery: { restingHr: 52, hrvMs: 89, sleepMinutes: 374 }, strength: { historyReady: true, completedSetCount: 12 } };
  if (name === "getStrengthHistory") return { status: "ok", demo: true, count: 3, rows: [{ workout_date: "2026-09-15", exercise: "DB bench press", set_no: 1, actual_kg: 16, actual_reps: 8, rpe: 7, completed: 1 }, { workout_date: "2026-09-15", exercise: "Low row", set_no: 1, actual_kg: 40, actual_reps: 9, rpe: 7.5, completed: 1 }, { workout_date: "2026-09-15", exercise: "DB shoulder press", set_no: 1, actual_kg: 10, actual_reps: 8, rpe: 7, completed: 1 }] };
  if (name === "getTodayStrengthSheet") return { status: "ok", demo: true, sheet: "Dnešní trénink", workoutDate: date, values: [["Datum", "17.09.2026"], ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"], ["WORK", "DB bench press", 1, 16, "6–10", "", "", "", false, "", ""]] };
  if (name === "generateStrengthPlan") return { status: "ok", demo: true, preview: Boolean(args.preview), planName: "Upper Body + Core", rationale: "Demo fixture: protect legs around cycling load.", loadFactor: 0.95, rows: [{ type: "WORK", exercise: "DB bench press", set: 1, plannedKg: 16, plannedReps: "6–10" }, { type: "WORK", exercise: "Low row", set: 1, plannedKg: 40, plannedReps: "6–10" }] };
  if (name === "syncStrengthSheet") return { status: "ok", demo: true, completedRows: 2, syncedCompletedRows: 2 };
  if (name === "analyzeStrengthWorkout") return { status: "ok", demo: true, analysis: { completedSets: 2, summary: "Demo fixture: loads were completed within the target rep range." } };
  if (name === "findStrengthAlternatives") return { status: "ok", demo: true, exercise: args.exercise || null, alternatives: [{ name: "Machine chest press", reason: "Horizontal push alternative" }, { name: "Push-up", reason: "Bodyweight horizontal push" }] };
  if (name === "substituteStrengthExercise") return { status: "ok", demo: true, replaced: args.from, replacement: args.to || "Machine chest press", workoutDate: date };
  throw new Error(`Unsupported demo tool: ${name}`);
}

async function callHealthApi(request, env, toolName, args) {
  const base = new URL(request.url).origin;
  const routes = {
    getStrengthContext: () => `/strength/context${args.date ? `?date=${encodeURIComponent(String(args.date))}` : ""}`,
    getStrengthHistory: () => `/strength/history?limit=${encodeURIComponent(String(args.limit ?? 100))}`,
    getTodayStrengthSheet: () => "/strength/sheet/today",
    generateStrengthPlan: () => "/strength/generate-plan",
    syncStrengthSheet: () => "/strength/sync",
    analyzeStrengthWorkout: () => "/strength/analyze",
    findStrengthAlternatives: () => "/strength/alternatives",
    substituteStrengthExercise: () => "/strength/substitute"
  };
  const route = routes[toolName];
  if (!route) throw new Error(`Unsupported tool: ${toolName}`);
  const method = ["getStrengthContext", "getStrengthHistory", "getTodayStrengthSheet"].includes(toolName) ? "GET" : "POST";
  const path = route();
  const headers = new Headers({ Accept: "application/json" });
  const internalKey = env.STRENGTH_API_KEY || env.MCP_API_KEY;
  if (!internalKey) throw new Error("Strength API authentication is not configured");
  headers.set("Authorization", `Bearer ${internalKey}`);
  if (method === "POST") headers.set("Content-Type", "application/json");
  let body;
  if (method === "POST") {
    if (toolName === "generateStrengthPlan") body = JSON.stringify({ date: args.date, preview: Boolean(args.preview) });
    else if (toolName === "analyzeStrengthWorkout") body = JSON.stringify({ command: args.command || "analyze" });
    else if (toolName === "findStrengthAlternatives") body = JSON.stringify({ exercise: args.exercise || "", muscle: args.muscle || "" });
    else if (toolName === "substituteStrengthExercise") body = JSON.stringify({ from: args.from, to: args.to || "", muscle: args.muscle || "" });
    else body = "{}";
  }
  const response = await fetch(`${base}${path}`, { method, headers, body });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { status: "error", message: text }; }
  if (!response.ok) throw new Error(data?.message || data?.error?.message || `health-api HTTP ${response.status}`);
  return data;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
