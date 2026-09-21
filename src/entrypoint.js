import app from "./sheets-gateway.js";
import { handleMcpCompat } from "./mcp-compat.js";
import { handleOAuthCompat } from "./oauth-compat.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";

const OPENAPI_URL = "https://raw.githubusercontent.com/shaarkyn/health-api/main/openapi.json";

export default {
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp/health" && request.method === "GET") return Response.json({ status: "ok", service: "health-api-mcp", version: "1.0.4", endpoint: "/mcp", protocol: "2026-07-28+legacy" });
    if (url.pathname === "/automation/strength") return handleStrengthAutomation(request, env, ctx);
    const oauthResponse = await handleOAuthCompat(request, env, url.pathname);
    if (oauthResponse) return oauthResponse;
    if (url.pathname === "/mcp") return handleMcpCompat(request, env);
    if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      if (!env.OPENAI_APP_CHALLENGE) return new Response("Not configured", { status: 404 });
      return new Response(env.OPENAI_APP_CHALLENGE, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/privacy" && request.method === "GET") return policyPage("Privacy Policy", `Health & Strength is a personal training app backed by a private health-api service. The app may process training history, workout plans, cycling context, recovery metrics supplied by connected services, and Google Sheet workout data solely to provide the requested training workflows. Data is sent to the connected backend and is not sold. Do not use this app with data belonging to another person without authorization.`);
    if (url.pathname === "/terms" && request.method === "GET") return policyPage("Terms of Use", `Health & Strength is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.`);
    if (url.pathname === "/support" && request.method === "GET") return policyPage("Support", `Support for Health & Strength is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.`);
    if (url.pathname === "/logo.svg" && request.method === "GET") return logoResponse();
    if (url.pathname === "/openapi.json" && request.method === "GET") {
      const response = await fetch(OPENAPI_URL, { cf: { cacheTtl: 60 } });
      if (!response.ok) return new Response(JSON.stringify({ status: "error", message: "OpenAPI schema unavailable" }), { status: 502, headers: { "content-type": "application/json" } });
      const text = await response.text();
      return new Response(text, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
    }
    return app.fetch(request, env, ctx);
  }
};

async function handleStrengthAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    const action = String(body?.action || "generate").toLowerCase();
    const preview = body?.preview === true;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });

    const routes = {
      generate: "/strength/generate-plan",
      regenerate: "/strength/generate-plan",
      adjust: "/strength/generate-plan",
      shorten: "/strength/generate-plan",
      protect_legs: "/strength/generate-plan",
      focus_upper: "/strength/generate-plan",
      focus_lower: "/strength/generate-plan",
      substitute: "/strength/substitute",
      import_history: "/strength/history/import"
    };
    const route = routes[action];
    if (!route) return Response.json({ status: "error", message: `Unknown strength action: ${action}` }, { status: 400 });

    const internalUrl = new URL(route, request.url);
    const payload = { ...body, date, preview, action };
    if (action === "protect_legs" || action === "focus_upper") payload.forceProtectLegs = true;
    if (action === "shorten" && payload.durationMinutes == null) payload.durationMinutes = 60;
    if (action === "substitute") {
      if (!payload.from) return Response.json({ status: "error", message: "substitute requires 'from'" }, { status: 400 });
      if (!payload.to && !payload.muscle) return Response.json({ status: "error", message: "substitute requires 'to' or 'muscle'" }, { status: 400 });
    }

    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json({ ...result, action }, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}

function policyPage(title, text) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — Health & Strength</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function logoResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#111827"/><path d="M68 132h32l18-54 30 100 20-46h20" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="68" cy="132" r="8" fill="#fff"/></svg>`;
  return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
