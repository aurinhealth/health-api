// Admin routes (/app/api/admin/*) and the deploy smoke test of the gym generator.
import app from "./strength-gateway.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { internalHeaders } from "./internal-auth.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";
import { listWaitlist, decideWaitlist } from "./testflight-waitlist.js";
import { aiSpendingReport } from "./ai-total.js";
import { usageReport } from "./usage-stats.js";

// Only the app's owner (OWNER_EMAIL, tenancy.js isOwner) gets here. There is no
// route that lists, invites, blocks or moves other accounts (security audit
// 2026-11, SEC-002): no screen used them, and with a stolen owner session they
// would have handed over any account. Such a rare change is done in the
// database on the owner's request.
export async function handleAdminApi(request, env, url, session) {
  const user = session.user;
  if (!session.signedIn || !user?.isOwner) return Response.json({status:"error",message:L("Jen pro majitele aplikace.", "The app owner only.")},{status:403});
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return Response.json({message:L("Neplatný původ požadavku.", "Invalid request origin.")},{status:403});
  const db = env.RAW_DB;
  try {
    // The website's waitlist (testflight-waitlist.js): the owner approves people into TestFlight.
    if (url.pathname === "/app/api/admin/waitlist" || url.pathname === "/app/api/admin/waitlist/decide") {
      try {
        if (request.method === "GET") return Response.json({status:"ok",...await listWaitlist(db, env)},{headers:{"Cache-Control":"no-store"}});
        return Response.json(await decideWaitlist(db, env, await request.json().catch(() => ({}))),{headers:{"Cache-Control":"no-store"}});
      } catch (error) { return Response.json({status:"error",message:error.message},{status:error.status||500}); }
    }
    // Nastavení → Správa → Útraty AI (ai-total.js): today's spending by group against its brake.
    if (url.pathname === "/app/api/admin/ai-spending" && request.method === "GET") return Response.json({status:"ok",...await aiSpendingReport(env)},{headers:{"Cache-Control":"no-store"}});
    // Usage statistics (usage-stats.js): daily counts and returns per sign-up week, no accounts.
    if (url.pathname === "/app/api/admin/usage" && request.method === "GET") return Response.json({status:"ok",...await usageReport(db, { days: url.searchParams.get("days") })},{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return Response.json({status:"error",message:error.message},{status:400}); }
  return Response.json({status:"error",message:"Not found"},{status:404});
}

// The deploy smoke test of the gym generator (deploy-worker.yml): the plan is
// built, never written. A gym plan is saved only when the athlete asks for it
// (Aktivita dne "Dát na dnes", the gym builder, Vygenerovat tréninky); the gym
// days of the week plan are preferences for the AI, not a plan, so nothing
// makes one at night.
export async function handleStrengthAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? localToday() : String(body.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });
    if (body?.preview !== true) return Response.json({ status: "skipped", action: "generate", date, reason: "A gym plan is made only when the athlete asks for it." });
    const internalRequest = new Request(new URL("/strength/generate-plan", request.url), {
      method: "POST",
      headers: { ...internalHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ date, preview: true, diagnostic: true, action: "generate" })
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json({ ...result, action: "generate" }, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}
