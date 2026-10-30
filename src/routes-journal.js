// Deník (the habit journal) routes of the app API (journal-store.js,
// journal-catalog.js, journal-impact.js):
// GET  /app/api/journal?date=          one day: the week strip, the mood and the tracked items by part of the day
// POST /app/api/journal/entry          {date, key, answer, amount, time, extra}: one answer (answer null clears it)
// GET  /app/api/journal/catalog        Upravit deník: every item with whether it is pinned
// POST /app/api/journal/pinned         {pinned: [keys]}: the journal's items in their order
// POST /app/api/journal/custom         {name, type, unit, usual, when, category}, or {remove: key}
// GET  /app/api/journal/today          the morning sheet about yesterday, the Zdraví card's effects and a new finding
// POST /app/api/journal/dismiss        {date}: the morning sheet put away for that day; {discovery: true}: the finding seen
// POST /app/api/journal/options        {enabled, askMorning, shareSensitive}: Nastavení → Deník
// POST /app/api/journal/fixed          {key, answer: 0 | 1 | null, date}: "Vždy ne" / "Vždy ano" from that day on
// GET  /app/api/journal/impact?metric= Co na tebe působí: readiness, hrv, sleep or rhr
// GET  /app/api/journal/item?key=&metric=  one item in detail
// `mornings(from, to)` loads the morning metrics (entrypoint.js journalMornings).
import { CATEGORIES, categoryTitle, itemView, unitText, NOT_RANKED, PARTS, partTitle, usualPart, partOfTime, moodText, isSensitive, NEVER_TO_AI } from "./journal-catalog.js";
import { getJournalSettings, saveJournalSettings, getJournalFindings, saveJournalFindings, journalItems, findItem, pinnedItems, setPinned, saveCustomItem, listJournalEntries, saveJournalEntry, autoDays, sickDays, setJournalOptions, setFixed, withFixed, MOOD } from "./journal-store.js";
import { dayState, rankImpacts, newDiscovery, itemDetail, thresholdOf, levelTime, METRICS, WINDOW_DAYS, DISCOVERY_PERCENT, MIN_DAYS, shiftDay } from "./journal-impact.js";
import { getAthleteState } from "./athlete-state.js";
import { L, plural, num } from "./lang.js";
import { localToday, localHour } from "./user-time.js";

const journalNoStore = { headers: { "Cache-Control": "no-store" } };
const isJournalDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const journalMonday = date => shiftDay(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
const signedPercent = pct => (pct < 0 ? "−" : "+") + Math.abs(pct) + " %";

export const metricTitle = metric => ({ readiness: L("Připravenost", "Readiness"), hrv: "HRV", sleep: L("Spánek", "Sleep"), rhr: L("Klidový tep", "Resting HR"), deep: L("Hluboký spánek", "Deep sleep") })[metric] || metric;
const journalMetricWord = metric => ({ readiness: L("připravenost", "readiness"), hrv: "HRV", sleep: L("spánek", "sleep"), rhr: L("klidový tep", "resting heart rate") })[metric] || metric;

// The text of an answer: "2 · do 21:40", "180 mg · do 15:10", "300 mg", "21:15".
export function valueText(item, s) {
  if (!s || s.yes == null) return null;
  if (item.type === "yesno") return null;
  if (item.type === "time") return s.time || (s.yes === false ? L("Ne", "No") : null);
  if (item.type === "scale") return s.amount != null ? String(s.amount) : null;
  const amount = s.amount ?? 0;
  const unit = typeof item.unit === "string" ? item.unit : "";
  const head = num(amount, 1) + (unit ? " " + unit : "");
  return s.time && amount > 0 ? head + " · " + L("do ", "last ") + s.time : head;
}

// One item on a day: its own answer, else the day's data, else "Vždy ne / ano".
function journalItemOnDay(item, entry, auto) {
  const state = dayState(item, entry, auto);
  const fromData = !entry && state.yes != null;
  const fixed = !entry && auto?.fixed ? (auto.yes ? 1 : 0) : null;
  const amount = entry ? entry.amount : auto?.amount != null ? auto.amount : null;
  const time = entry ? entry.time : auto?.time || null;
  const answer = entry ? entry.answer : fromData ? (item.type === "yesno" ? (state.yes ? 1 : 0) : (amount ?? 1) > 0 || time || fixed === 1 ? 1 : 0) : null;
  const shown = { yes: state.yes, amount, time };
  const mood = item.key === MOOD && fixed == null ? moodText(amount, entry?.extra?.labels) : null;
  const value = mood || (fixed != null ? (fixed ? L("vždy ano", "always yes") : L("vždy ne", "always no")) : valueText(item, shown));
  // The row: the time on the left, the value without it on the right.
  const short = mood || fixed != null ? value
    : item.type === "time" ? (time ? null : value)
      : item.type === "amount" && state.yes != null ? num(amount ?? 0, 1) + (unitText(item.unit, amount ?? 0) ? " " + unitText(item.unit, amount ?? 0) : "")
        : valueText(item, { ...shown, time: null });
  const part = partOfTime(time) || usualPart(item);
  return { ...itemView(item), answered: state.yes != null, answer, amount, time, extra: entry?.extra || null, value, short, part, fromData, ...(fixed != null ? { fixed } : {}) };
}

// Within a part: by time (after midnight after the evening), untimed last.
const partOrder = v => v.time ? (v.time < "04:00" ? "2" : "1") + v.time : "3";

async function journalDayData(db, from, to, settings = null) {
  const [entries, rawAuto] = await Promise.all([listJournalEntries(db, from, to), autoDays(db, from, to)]);
  const auto = settings ? withFixed(settings, rawAuto, from, to) : rawAuto;
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.date)) byDay.set(e.date, new Map());
    byDay.get(e.date).set(e.key, e);
  }
  return { entries: byDay, auto };
}

// The journal of one day: the week (Po–Ne) with each day done, partial or
// empty, the mood and the pinned items grouped into the catalogue's sections.
export async function journalDay(db, date, today) {
  const settings = await getJournalSettings(db);
  const start = journalMonday(date), end = shiftDay(start, 6);
  const { entries, auto } = await journalDayData(db, start, end < today ? end : today, settings);
  const items = pinnedItems(settings);
  const stateOf = d => {
    if (d > today) return "future";
    const answered = items.filter(i => dayState(i, entries.get(d)?.get(i.key), auto[d]?.[i.key]).yes != null).length;
    return items.length && answered === items.length ? "done" : answered > 0 ? "partial" : "empty";
  };
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(start, i)).map(d => ({ date: d, state: stateOf(d) }));
  const views = items.map(i => journalItemOnDay(i, entries.get(date)?.get(i.key), auto[date]?.[i.key]));
  const sections = PARTS.map(part => ({ key: part, title: partTitle(part), items: views.filter(v => v.part === part).sort((a, b) => partOrder(a).localeCompare(partOrder(b))) })).filter(s => s.items.length);
  return { date, today, week, mood: entries.get(date)?.get(MOOD)?.amount ?? null, answered: views.filter(v => v.answered).length, total: views.length, sections, enabled: settings.enabled };
}

export async function journalCatalog(db) {
  const settings = await getJournalSettings(db);
  const pinned = new Set(settings.pinned);
  const items = journalItems(settings).map(i => ({ ...itemView(i), pinned: pinned.has(i.key), ...(settings.fixed[i.key] ? { fixed: settings.fixed[i.key].answer } : {}) }));
  const collator = new Intl.Collator(L("cs", "en"));
  // Co sledovat: what is tracked first, then by name.
  items.sort((a, b) => (b.pinned - a.pinned) || collator.compare(a.name, b.name));
  return { count: items.length, categories: CATEGORIES.map(c => ({ key: c, title: categoryTitle(c) })), items, pinned: settings.pinned, enabled: settings.enabled, askMorning: settings.askMorning, shareSensitive: settings.shareSensitive };
}

// ---- Impact ----

// Each item's days over the last 90 days (journal days, yesterday the last).
async function journalItemSeries(db, settings, today, keys = null) {
  const from = shiftDay(today, -WINDOW_DAYS), to = shiftDay(today, -1);
  const { entries, auto } = await journalDayData(db, from, to, settings);
  const answered = new Set();
  for (const day of entries.values()) for (const k of day.keys()) answered.add(k);
  for (const day of Object.values(auto)) for (const k of Object.keys(day)) answered.add(k);
  const items = keys ? keys.map(k => findItem(settings, k)).filter(Boolean)
    : journalItems(settings).filter(i => !NOT_RANKED.has(i.key) && (settings.pinned.includes(i.key) || answered.has(i.key)));
  const dates = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) dates.push(d);
  return items.map(item => ({ key: item.key, item, days: dates.map(date => ({ date, ...dayState(item, entries.get(date)?.get(item.key), auto[date]?.[item.key]) })) }));
}

const journalNameOf = (settings, key) => { const item = findItem(settings, key); return item ? itemView(item).name : key; };
const journalDayWord = n => plural(n, "dalším dni", "dalších dnech", "dalších dnech", "more day", "more days");

// "Vliv ukážu po 2 dalších dnech s ✓" (or ✕, or both).
export function waitingText(w) {
  if (w.needYes && w.needNo) return L(`Vliv ukážu po ${w.needYes} ${journalDayWord(w.needYes)} s ✓ a ${w.needNo} s ✕`, `I'll show the effect after ${w.needYes} ${journalDayWord(w.needYes)} with ✓ and ${w.needNo} with ✕`);
  const n = w.needYes || w.needNo, mark = w.needYes ? "✓" : "✕";
  return L(`Vliv ukážu po ${n} ${journalDayWord(n)} s ${mark}`, `I'll show the effect after ${n} ${journalDayWord(n)} with ${mark}`);
}

async function journalImpactInputs(env, today, mornings) {
  const settings = await getJournalSettings(env.DB);
  const from = shiftDay(today, -WINDOW_DAYS);
  const [series, morning, state] = await Promise.all([journalItemSeries(env.DB, settings, today), mornings(shiftDay(from, 1), today), getAthleteState(env.DB).catch(() => null)]);
  const excluded = await sickDays(env.DB, from, today, state);
  return { settings, series, morning, excluded };
}

export function impactView(settings, series, metric, morning, excluded) {
  const { ranked, waiting } = rankImpacts(series, metric, morning, { excluded });
  const view = key => { const item = findItem(settings, key), v = itemView(item); return { key, name: v.name, icon: v.icon }; };
  return {
    metric, metricTitle: metricTitle(metric), minDays: MIN_DAYS,
    items: ranked.map(r => ({ ...view(r.key), effect: r.effect, yes: r.yes, no: r.no })),
    waiting: waiting.map(w => ({ ...view(w.key), yes: w.yes, no: w.no, text: waitingText(w) }))
  };
}

// Readiness findings for the coach and the "Nový objev" card, saved once a day.
async function refreshJournalFindings(env, today, mornings, inputs = null) {
  const { settings, series, morning, excluded } = inputs || await journalImpactInputs(env, today, mornings);
  const { ranked } = rankImpacts(series, "readiness", morning, { excluded });
  await saveJournalFindings(env.DB, { date: today, metric: "readiness", ranked });
  const found = newDiscovery(ranked, settings.announced);
  if (found) await saveJournalSettings(env.DB, { ...settings, announced: [...settings.announced, found.key], discovery: { ...found, metric: "readiness", date: today } });
  return ranked;
}

// "Od 2 nápojů výš je to −22 %", only when the data supports it and it says
// more than the ✓ / ✕ comparison.
export function thresholdText(item, days, threshold) {
  if (!threshold || Math.abs(threshold.effect) < DISCOVERY_PERCENT) return null;
  const levels = days.filter(d => d.level != null).map(d => d.level);
  if (item.type === "amount" && levels.includes(0) && threshold.cut === Math.min(...levels.filter(l => l > 0))) return null;
  const pct = signedPercent(threshold.effect);
  if (item.type === "time") return L(`Od ${levelTime(threshold.cut)} dál je to ${pct}`, `From ${levelTime(threshold.cut)} on it is ${pct}`);
  const n = num(threshold.cut, 1);
  if (item.type === "scale") return L(`Od ${n} výš je to ${pct}`, `From ${n} up it is ${pct}`);
  const unit = item.unit && typeof item.unit === "object"
    ? L(threshold.cut === 1 ? item.unit.from[0] : item.unit.from[1], unitText(item.unit, threshold.cut))
    : item.unit || "";
  return L(`Od ${n}${unit ? " " + unit : ""} výš je to ${pct}`, `From ${n}${unit ? " " + unit : ""} up it is ${pct}`);
}

// ---- The morning sheet ----

// From 4:00 the sheet "Včera" while yesterday has an unanswered item; gone
// once answered or put away, and never when Deník or the morning questions
// are off. The app shows it on the first open of the day and keeps "Doplnit"
// on the Zdraví card while it is open.
export async function journalCard(db, today, hour) {
  if (hour < 4) return null;
  const settings = await getJournalSettings(db);
  if (!settings.enabled) return null;
  const items = pinnedItems(settings);
  if (!items.length) return null;
  const date = shiftDay(today, -1);
  if (settings.dismissed.includes(date)) return null;
  const { entries, auto } = await journalDayData(db, date, date, settings);
  const views = items.map(i => journalItemOnDay(i, entries.get(date)?.get(i.key), auto[date]?.[i.key]));
  const unanswered = views.filter(v => !v.answered).length;
  if (!unanswered) return null;
  return { date, isToday: false, answered: views.length - unanswered, total: views.length, open: unanswered, ask: settings.askMorning, rows: [] };
}

// The Zdraví card: the biggest effects on readiness (the last findings), at most 5.
export function journalTop(settings, findings) {
  return (findings?.ranked || []).filter(r => Math.abs(r.effect) >= 3 && findItem(settings, r.key))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 5)
    .map(r => { const v = itemView(findItem(settings, r.key)); return { key: r.key, name: v.name, icon: v.icon, effect: r.effect }; });
}

function journalDiscoveryView(settings) {
  const d = settings.discovery;
  if (!d || d.seen) return null;
  const item = findItem(settings, d.key);
  if (!item) return null;
  const v = itemView(item), pct = Math.abs(d.effect);
  const text = d.effect > 0
    ? L(`${v.name}: další ráno máš ${journalMetricWord(d.metric)} o ${pct} % lepší.`, `${v.name}: your ${journalMetricWord(d.metric)} the next morning is ${pct} % better.`)
    : L(`${v.name}: další ráno máš ${journalMetricWord(d.metric)} o ${pct} % horší.`, `${v.name}: your ${journalMetricWord(d.metric)} the next morning is ${pct} % worse.`);
  return { key: d.key, name: v.name, icon: v.icon, metric: d.metric, effect: d.effect, text };
}

// ---- The coach ----

// What the AI coach gets: the readiness findings (top 6 by size) and
// yesterday's answers. Read only from what is stored; never computed here.
// The sensitive items (mood, cannabis, medication) only with the consent;
// sex never, neither as an answer nor as a finding.
export async function journalForCoach(db, date) {
  const settings = await getJournalSettings(db);
  if (!settings.enabled) return null;
  const findings = await getJournalFindings(db);
  const yesterday = shiftDay(date, -1);
  const { entries, auto } = await journalDayData(db, yesterday, yesterday, settings);
  const shown = item => item && !NEVER_TO_AI.has(item.key) && (settings.shareSensitive || !isSensitive(item));
  const answers = pinnedItems(settings).filter(shown).map(i => journalItemOnDay(i, entries.get(yesterday)?.get(i.key), auto[yesterday]?.[i.key])).filter(v => v.answered)
    .map(v => ({ item: v.name, answer: v.type === "yesno" ? (v.answer ? "yes" : "no") : v.value || (v.answer ? "yes" : "no") }));
  const top = (findings?.ranked || []).filter(r => Math.abs(r.effect) >= 3 && shown(findItem(settings, r.key))).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 6)
    .map(r => ({ item: journalNameOf(settings, r.key), nextMorningReadinessPercent: r.effect, daysWith: r.yes, daysWithout: r.no }));
  if (!top.length && !answers.length) return null;
  return { ...(top.length ? { findings: top } : {}), ...(answers.length ? { yesterday: { date: yesterday, answers } } : {}) };
}

// ---- Routes ----

export async function handleJournalApi(request, env, ctx, url, session, { mornings } = {}) {
  if (!url.pathname.startsWith("/app/api/journal")) return undefined;
  if (!session.signedIn) return Response.json({ message: L("Přihlas se do dashboardu.", "Sign in to the app.") }, { status: 401 });
  try {
    const today = localToday(), db = env.DB;
    const loadMornings = mornings || (async () => ({}));
    if (request.method === "GET") {
      if (url.pathname === "/app/api/journal") {
        const d = url.searchParams.get("date"), date = isJournalDate(d) && d <= today ? d : shiftDay(today, -1);
        return Response.json({ status: "ok", ...(await journalDay(db, date, today)) }, journalNoStore);
      }
      if (url.pathname === "/app/api/journal/catalog") return Response.json({ status: "ok", ...(await journalCatalog(db)) }, journalNoStore);
      if (url.pathname === "/app/api/journal/today") {
        let settings = await getJournalSettings(db);
        const findings = await getJournalFindings(db);
        // The findings once a day; a new one becomes "Nový objev".
        if (findings?.date !== today) {
          await refreshJournalFindings(env, today, loadMornings).catch(error => console.error("Journal findings failed", error.message));
          settings = await getJournalSettings(db);
        }
        const latest = await getJournalFindings(db);
        return Response.json({ status: "ok", enabled: settings.enabled, askMorning: settings.askMorning, card: await journalCard(db, today, localHour()), top: settings.enabled ? journalTop(settings, latest) : [], discovery: settings.enabled ? journalDiscoveryView(settings) : null }, journalNoStore);
      }
      if (url.pathname === "/app/api/journal/impact") {
        const metric = METRICS.includes(url.searchParams.get("metric")) ? url.searchParams.get("metric") : "readiness";
        const inputs = await journalImpactInputs(env, today, loadMornings);
        if (metric === "readiness") await refreshJournalFindings(env, today, loadMornings, inputs).catch(error => console.error("Journal findings failed", error.message));
        return Response.json({ status: "ok", metrics: METRICS.map(m => ({ key: m, title: metricTitle(m) })), ...impactView(inputs.settings, inputs.series, metric, inputs.morning, inputs.excluded) }, journalNoStore);
      }
      if (url.pathname === "/app/api/journal/item") {
        const metric = METRICS.includes(url.searchParams.get("metric")) ? url.searchParams.get("metric") : "readiness";
        const settings = await getJournalSettings(db), item = findItem(settings, url.searchParams.get("key"));
        if (!item) return Response.json({ message: L("Neznámá položka deníku.", "Unknown journal item.") }, { status: 404 });
        const from = shiftDay(today, -WINDOW_DAYS);
        const [series, morning, state] = await Promise.all([journalItemSeries(db, settings, today, [item.key]), loadMornings(shiftDay(from, 1), today), getAthleteState(db).catch(() => null)]);
        const excluded = await sickDays(db, from, today, state);
        const days = series[0].days, detail = itemDetail(days, metric, morning, { today, excluded });
        const threshold = item.type === "amount" || item.type === "time" || item.type === "scale" ? thresholdOf(days, metric, morning, { excluded }) : null;
        const v = itemView(item);
        return Response.json({
          status: "ok", ...v, metric, metricTitle: metricTitle(metric), minDays: MIN_DAYS,
          effect: detail.impact.effect, yes: detail.impact.yes, no: detail.impact.no,
          compare: detail.compare.map(c => ({ ...c, title: metricTitle(c.metric) })),
          chart: detail.chart,
          threshold: thresholdText(item, days.filter(d => !excluded.has(d.date)), threshold)
        }, journalNoStore);
      }
      return Response.json({ message: "Not found" }, { status: 404 });
    }
    if (request.method !== "POST") return Response.json({ message: "Method not allowed" }, { status: 405 });
    if (request.headers.get("Origin") !== url.origin) return Response.json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    if (url.pathname === "/app/api/journal/entry") {
      if (!(isJournalDate(body.date) && body.date <= today)) throw new Error(L("Zapsat jde jen dnešek a dny před ním.", "Only today and earlier days can be logged."));
      const settings = await getJournalSettings(db);
      await saveJournalEntry(db, settings, body);
      return Response.json({ status: "ok", ...(await journalDay(db, body.date, today)) }, journalNoStore);
    }
    if (url.pathname === "/app/api/journal/options") {
      const settings = await setJournalOptions(db, body);
      return Response.json({ status: "ok", enabled: settings.enabled, askMorning: settings.askMorning, shareSensitive: settings.shareSensitive }, journalNoStore);
    }
    if (url.pathname === "/app/api/journal/fixed") {
      const date = isJournalDate(body.date) && body.date <= today ? body.date : shiftDay(today, -1);
      const answer = body.answer === 0 || body.answer === 1 ? body.answer : null;
      await setFixed(db, String(body.key || ""), answer, date);
      // The day's own answer gives way to the fixed one, so the row shows it.
      if (answer != null) await saveJournalEntry(db, await getJournalSettings(db), { date, key: String(body.key), answer: null });
      return Response.json({ status: "ok", ...(await journalDay(db, date, today)) }, journalNoStore);
    }
    if (url.pathname === "/app/api/journal/pinned") {
      const settings = await setPinned(db, body.pinned);
      return Response.json({ status: "ok", pinned: settings.pinned }, journalNoStore);
    }
    if (url.pathname === "/app/api/journal/custom") {
      const { settings, item } = await saveCustomItem(db, body);
      return Response.json({ status: "ok", item: item ? itemView(item) : null, pinned: settings.pinned }, journalNoStore);
    }
    if (url.pathname === "/app/api/journal/dismiss") {
      const settings = await getJournalSettings(db);
      if (body.discovery) {
        await saveJournalSettings(db, { ...settings, discovery: settings.discovery ? { ...settings.discovery, seen: true } : null });
      } else {
        const date = isJournalDate(body.date) && body.date <= today ? body.date : shiftDay(today, -1);
        await saveJournalSettings(db, { ...settings, dismissed: [...settings.dismissed.filter(d => d !== date), date] });
      }
      return Response.json({ status: "ok" }, journalNoStore);
    }
    return Response.json({ message: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ message: error.message }, { status: 400 });
  }
}

