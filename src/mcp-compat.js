import { handleMcp } from "./mcp.js";

const MODERN = "2026-07-28";
const SERVER_INFO = { name: "health-api-strength-coach", title: "Health API Strength Coach", version: "1.0.2" };

export async function handleMcpCompat(request, env) {
  const protocol = request.headers.get("MCP-Protocol-Version");
  const origin = new URL(request.url).origin;

  if (request.method === "POST" && protocol === MODERN) {
    const message = await request.clone().json().catch(() => null);
    if (message?.method === "server/discover") {
      return json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          supportedVersions: [MODERN, "2025-11-25", "2025-06-18"],
          capabilities: { tools: {} },
          instructions: "Use strength context and completed strength history before generating a workout. generateStrengthPlan writes the adaptive workout unless preview=true.",
          _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO }
        }
      });
    }

    // The existing implementation is the battle-tested 2025-era handler.
    // Strip the modern version header so it can process the same JSON-RPC call.
    const headers = new Headers(request.headers);
    headers.delete("MCP-Protocol-Version");
    const legacyRequest = new Request(request, { headers });
    const response = await handleMcp(legacyRequest, env);
    return normalizeToolResult(response, origin);
  }

  const response = await handleMcp(request, env);
  return normalizeToolResult(response, origin);
}

async function normalizeToolResult(response, origin) {
  if (response.status === 401) {
    const headers = new Headers(response.headers);
    headers.set("WWW-Authenticate", `Bearer realm="health-api-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="strength:read strength:write"`);
    return new Response(response.body, { status: response.status, headers });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().json().catch(() => null);
  if (!body?.result?.content || !Array.isArray(body.result.content)) return response;
  if (body.result.structuredContent !== undefined) return response;

  const text = body.result.content.find((item) => item?.type === "text")?.text;
  if (!text) return response;
  try { body.result.structuredContent = JSON.parse(text); } catch { return response; }

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
