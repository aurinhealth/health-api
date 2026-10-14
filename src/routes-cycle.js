// Cycle tracking routes of the dashboard API (cycle-store.js, cycle-model.js):
// GET /app/api/cycle (?month=YYYY-MM for the calendar), POST
// /app/api/cycle/settings, /app/api/cycle/day (what was logged on a day) and
// /app/api/cycle/apple (Apple Health's menstrual flow and ovulation tests).
// Open to everyone, whatever the profile's sex; the app offers it up front
// only to women (SettingsHome.swift).
import { getCycleSettings, saveCycleSettings, listCycleDays, saveCycleDay, importAppleCycle } from "./cycle-store.js";
import { cycleState, cycleMonth, askPeriodToday } from "./cycle-model.js";
import { L } from "./lang.js";
import { localToday } from "./user-time.js";

const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const noStore = { headers: { "Cache-Control": "no-store" } };

// Everything the cycle screens show for `today` and the month.
export async function cycleView(db, today, month) {
  const settings = await getCycleSettings(db);
  const m = /^\d{4}-\d{2}$/.test(String(month || "")) ? month : today.slice(0, 7);
  const days = await listCycleDays(db, shift(today, -200), shift(m + "-01", 45));
  const input = { settings, days, today };
  const state = cycleState({ settings, days, date: today });
  return { settings, state, askPeriod: askPeriodToday(state), month: m, days: settings.enabled ? cycleMonth(input, m) : [] };
}

export async function handleCycleApi(request, env, ctx, url, session) {
  if (!url.pathname.startsWith("/app/api/cycle")) return undefined;
  if (!session.signedIn) return Response.json({ message: L("Přihlas se do dashboardu.", "Sign in to the app.") }, { status: 401 });
  try {
    const today = localToday();
    if (url.pathname === "/app/api/cycle" && request.method === "GET") {
      return Response.json({ status: "ok", available: true, ...(await cycleView(env.DB, today, url.searchParams.get("month"))) }, noStore);
    }
    if (request.method !== "POST") return Response.json({ message: "Method not allowed" }, { status: 405 });
    if (request.headers.get("Origin") !== url.origin) return Response.json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (url.pathname === "/app/api/cycle/settings") {
      await saveCycleSettings(env.DB, body);
      return Response.json({ status: "ok", ...(await cycleView(env.DB, today, body.month)) }, noStore);
    }
    if (url.pathname === "/app/api/cycle/day") {
      if (!(body.date <= today)) throw new Error(L("Zapsat jde jen dnešek a dny před ním.", "Only today and earlier days can be logged."));
      const day = await saveCycleDay(env.DB, body);
      return Response.json({ status: "ok", day, ...(await cycleView(env.DB, today, body.month)) }, noStore);
    }
    if (url.pathname === "/app/api/cycle/apple") {
      const saved = await importAppleCycle(env.DB, body.days);
      return Response.json({ status: "ok", saved }, noStore);
    }
    return Response.json({ message: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ message: error.message }, { status: 400 });
  }
}
