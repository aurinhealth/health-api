// Admin routes (/app/api/admin/*) and the deploy smoke test of the gym generator.
import app from "./strength-gateway.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { saveCookbook } from "./cookbook.js";
import { internalHeaders } from "./internal-auth.js";
import { listUsersAndInvites, inviteUser, removeInvite, changeUserEmail, setUserDisabled } from "./tenancy.js";
import { emailChangeRefusal, notifyOldAddress } from "./email-login.js";
import { L, storedLanguage } from "./lang.js";
import { localToday, storedTimeZone } from "./user-time.js";
import { listWaitlist, decideWaitlist } from "./testflight-waitlist.js";
import { aiSpendingReport } from "./ai-total.js";

export async function handleAdminApi(request, env, url, session, ctx) {
  const user = session.user;
  if (!session.signedIn || !user?.isAdmin) return Response.json({status:"error",message:L("Jen pro správce.", "Admins only.")},{status:403});
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return Response.json({message:L("Neplatný původ požadavku.", "Invalid request origin.")},{status:403});
  const db = env.RAW_DB;
  try {
    // The website's waitlist (testflight-waitlist.js): the owner approves people into TestFlight.
    if (url.pathname === "/app/api/admin/waitlist" || url.pathname === "/app/api/admin/waitlist/decide") {
      if (!user.isOwner) return Response.json({status:"error",message:L("Jen pro majitele aplikace.", "The app owner only.")},{status:403});
      try {
        if (request.method === "GET") return Response.json({status:"ok",...await listWaitlist(db, env)},{headers:{"Cache-Control":"no-store"}});
        return Response.json(await decideWaitlist(db, env, await request.json().catch(() => ({}))),{headers:{"Cache-Control":"no-store"}});
      } catch (error) { return Response.json({status:"error",message:error.message},{status:error.status||500}); }
    }
    // Nastavení → Správa → Útraty AI (ai-total.js): today's spending by group against its brake.
    if (url.pathname === "/app/api/admin/ai-spending" && request.method === "GET") {
      if (!user.isOwner) return Response.json({status:"error",message:L("Jen pro majitele aplikace.", "The app owner only.")},{status:403});
      return Response.json({status:"ok",...await aiSpendingReport(env)},{headers:{"Cache-Control":"no-store"}});
    }
    if (url.pathname === "/app/api/admin/users" && request.method === "GET") return Response.json({status:"ok",...await listUsersAndInvites(db)},{headers:{"Cache-Control":"no-store"}});
    const body = await request.json().catch(() => ({}));
    // The owner's private copy of his printed cookbook (cookbook.js); it never goes into the repository.
    if (url.pathname === "/app/api/admin/cookbook" && request.method === "POST") {
      if (!user.isOwner) return Response.json({status:"error",message:L("Kuchařku nahrává jen majitel aplikace.", "Only the app owner uploads the cookbook.")},{status:403});
      const {recipes} = await saveCookbook(db, body);
      return Response.json({status:"ok",recipes,message:L(`Kuchařka je nahraná: ${recipes} receptů.`, `The cookbook is uploaded: ${recipes} recipes.`)});
    }
    if (url.pathname === "/app/api/admin/invites" && request.method === "POST") return Response.json({status:"ok",email:await inviteUser(db, body.email, user.id),message:L("Pozvánka je uložená. Uživatel se může přihlásit přes Google.", "The invitation is saved. The user can sign in with Google.")});
    if (url.pathname === "/app/api/admin/invites" && request.method === "DELETE") { await removeInvite(db, body.email); return Response.json({status:"ok",message:L("Pozvánka je zrušená.", "The invitation is cancelled.")}); }
    // For someone who lost their address: the account (and its data) moves to the new one.
    if (url.pathname === "/app/api/admin/users/email" && request.method === "POST") {
      const changed = await changeUserEmail(db, env, body.id, body.email);
      if (changed.error) return emailChangeRefusal(changed.error);
      // In the user's language and zone, not the admin's.
      const [language, zone] = await Promise.all([storedLanguage(db, body.id, { fresh: true }), storedTimeZone(db, body.id, { fresh: true })]);
      await notifyOldAddress(env, changed, language, ctx, zone);
      return Response.json({status:"ok",email:changed.email,message:L("E-mail je změněný. Uživatel se přihlásí novou adresou.", "The email is changed. The user signs in with the new address.")});
    }
    if (url.pathname === "/app/api/admin/users" && request.method === "POST") { await setUserDisabled(db, env, body.id, body.disabled === true); return Response.json({status:"ok",message:body.disabled===true?L("Přístup je zablokovaný.", "Access is blocked."):L("Přístup je obnovený.", "Access is restored.")}); }
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
