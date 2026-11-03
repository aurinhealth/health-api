// The morning report as a readable e-mail (ops-report.js keeps the plain text
// beside it): one line on what needs the owner today, then each part with a
// traffic light, slow requests and AI as short tables. Inline styles only,
// since mail apps drop <style>; no images, nothing loaded from outside.

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = value => `${(Number(value) || 0).toFixed(2)} $`;
// Below a cent in cents, so a tester's 0.003 USD is not "0.00 $".
export const money = value => {
  const v = Number(value) || 0;
  return v >= 0.01 || v === 0 ? usd(v) : `${(v * 100).toFixed(1)} ¢`;
};

// A request the user waited this long for is red; below it orange.
export const RED_MS = 8000;
const RED_ROWS = 1000000;
const SLOW_SHOWN = 6;
const DOT = { red: "🔴", orange: "🟠", green: "🟢" };

// The screens behind the app's routes, as the owner knows them.
const ROUTE_NAMES = {
  "GET /app/api/coach/pick": "Výběr tréninku", "GET /app/api/today": "Dnes", "GET /app/api/coach-text": "Věta kouče",
  "POST /app/api/health/apple": "Nahrání z Apple Health", "GET /app/api/coach/week-check": "Kontrola týdne", "GET /app/api/me": "Účet",
  "GET /app/api/coach/check-in": "Check-in kouče", "GET /app/api/coach/revision": "Revize týdne", "GET /app/api/threshold-check": "Kontrola prahů",
  "GET /app/api/training": "Trénink", "GET /app/api/food/week": "Jídlo za týden", "GET /app/api/journal/today": "Deník",
  "GET /app/api/sync/prefs": "Nastavení synchronizace", "GET /app/api/week-plan": "Plán týdne", "POST /app/api/food/photo": "Jídlo z fotky",
  "GET /app/api/admin/waitlist": "Čekací listina (správa)", "POST /app/api/admin/waitlist/decide": "Schválení zájemce (správa)",
  "GET /app/api/food-today": "Jídlo dnes", "GET /app/api/gym": "Posilovna", "POST /app/api/gym": "Uložení série", "GET /app/api/health": "Zdraví",
  "GET /app/api/week": "Týden", "POST /app/api/food/log": "Zápis jídla", "POST /app/api/food/search": "Hledání jídla",
  "POST /app/api/onboarding": "Úvodní nastavení", "POST /app/api/planned/delete": "Smazání plánu", "POST /app/api/workouts/schedule": "Naplánování tréninku",
  "POST /app/api/calendar-free": "Volný čas v kalendáři", "POST /app/api/coach": "Chat s koučem"
};
export const routeLabel = service => ROUTE_NAMES[service] || (String(service).startsWith("cron ") ? `Úloha na pozadí: ${String(service).slice(5)}` : String(service));

// "4255 ms, 256 dotazů, 36926 řádků; čekání: D1 1200 ms, Intervals 4100 ms" (request-timing.js slowness).
export function parseSlow(message) {
  const text = String(message || "");
  const ms = Number(text.match(/^(\d+) ms/)?.[1]) || null;
  const rows = Number(text.match(/(\d+) řádků/)?.[1]) || 0;
  const waits = [...(text.split("čekání:")[1] || "").matchAll(/([^,]+?) (\d+) ms/g)].map(m => ({ kind: m[1].trim(), ms: Number(m[2]) }));
  const waited = waits.sort((a, b) => b.ms - a.ms)[0]?.kind || null;
  return { ms, rows, waited };
}
const seconds = ms => ms == null ? "–" : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const things = n => n === 1 ? "věc" : n >= 2 && n <= 4 ? "věci" : "věcí";
// A D1 storage error on Cloudflare's side: the next sync makes up for it.
const platformGlitch = message => /D1_ERROR|D1 DB|storage caused object to be reset/i.test(String(message || ""));

const cell = (content, { align = "left", muted = false, pad = "7px 0", nowrap = false } = {}) => `<td style="padding:${pad};text-align:${align};vertical-align:top${muted ? ";color:#71717a" : ""}${nowrap ? ";white-space:nowrap" : ""}">${content}</td>`;
const rowHtml = cells => `<tr style="border-top:1px solid #e4e4e7">${cells.join("")}</tr>`;
const table = (head, body) => `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${head ? `<tr style="color:#71717a;font-size:12px">${head}</tr>` : ""}${body.join("")}</table>`;
const heading = (title, light) => `<p style="margin:22px 0 8px;font-size:15px;font-weight:700">${escape(title)}${light ? ` ${DOT[light]}` : ""}</p>`;
const paragraph = text => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5">${escape(text)}</p>`;

// rows: ops_events of the day; room, stuck, accounts: the text parts of the
// plain report; ai: aiSummary (ops-report.js) or null with aiLines as text.
export function opsReportHtml({ date, rows = [], room = null, stuck = null, accounts = null, ai = null, aiLines = null, label = s => s }) {
  const of = kind => rows.filter(row => row.kind === kind).sort((a, b) => b.count - a.count);
  const important = [], parts = [];

  const sync = of("sync"), broken = of("broken"), server = of("server");
  for (const row of server) important.push(`Chyba serveru: ${row.service} (${row.count}×)`);
  for (const row of broken) important.push(`${label(row.service)}: propojení je rozbité, uživatel musí znovu připojit (${row.count}×)`);
  for (const row of sync) important.push(`${label(row.service)} ${row.count}× selhal${platformGlitch(row.last_message) ? " kvůli chybě D1 u Cloudflare, další synchronizace to dohnala" : ""}.`);
  const problemList = (title, light, items) => items.length ? heading(title, light) + table(null, items.map(row => rowHtml([
    cell(`${escape(label(row.service))}${row.last_message ? `<br><span style="font-size:12px;color:#a1a1aa">${escape(row.last_message)}</span>` : ""}`), cell(`${row.count}×`, { align: "right", nowrap: true, pad: "7px 0 7px 12px" })
  ]))) : "";
  parts.push(problemList("Chyby serveru", "red", server), problemList("Rozbitá propojení", "red", broken), problemList("Selhané synchronizace", "orange", sync));

  const slow = of("slow").map(row => {
    const s = parseSlow(row.last_message);
    return { ...row, ...s, light: (s.ms || 0) >= RED_MS || s.rows >= RED_ROWS ? "red" : "orange" };
  }).sort((a, b) => (a.light === b.light ? 0 : a.light === "red" ? -1 : 1) || (b.ms || 0) - (a.ms || 0));
  for (const row of slow.filter(r => r.light === "red").slice(0, 3)) important.push(`${routeLabel(row.service)} trvalo až ${seconds(row.ms)} (${row.count}×).`);
  if (slow.length) {
    const shown = slow.slice(0, SLOW_SHOWN), rest = slow.slice(SLOW_SHOWN);
    // "Čekal na" only once the requests say it (request-timing.js waitSummary).
    const waits = shown.some(row => row.waited);
    const head = cell("Co", { pad: "4px 0" }) + cell("Kolikrát", { align: "right", pad: "4px 0" }) + cell("Naposledy", { align: "right", pad: "4px 0 4px 12px" }) + (waits ? cell("Čekal na", { align: "right", pad: "4px 0 4px 12px" }) : "");
    const body = shown.map(row => rowHtml([
      cell(`${DOT[row.light]} ${escape(routeLabel(row.service))}<br><span style="font-size:12px;color:#a1a1aa">${escape(row.service)}${row.rows ? ` · ${row.rows.toLocaleString("cs-CZ")} řádků` : ""}</span>`),
      cell(`${row.count}×`, { align: "right", nowrap: true }), cell(seconds(row.ms), { align: "right", nowrap: true, pad: "7px 0 7px 12px" }), ...(waits ? [cell(escape(row.waited || "–"), { align: "right", pad: "7px 0 7px 12px" })] : [])
    ]));
    if (rest.length) body.push(`<tr style="border-top:1px solid #e4e4e7"><td colspan="${waits ? 4 : 3}" style="padding:7px 0;color:#71717a;font-size:13px;line-height:1.5">Další: ${escape(rest.map(r => `${routeLabel(r.service)} ${r.count}× (${seconds(r.ms)})`).join(", "))}</td></tr>`);
    parts.push(heading("Pomalé požadavky", slow.some(r => r.light === "red") ? "red" : "orange") + table(head, body));
  }

  if (room) { important.push("Dochází místo pro účty."); parts.push(heading("Místo pro účty", "orange") + room.split("\n").map(line => paragraph(line.replace(/^- /, ""))).join("")); }
  if (stuck) { important.push("Některá smazání účtů opakovaně selhávají."); parts.push(heading("Nedokončená smazání účtů", "orange") + stuck.split("\n").map(line => paragraph(line.replace(/^- /, ""))).join("")); }

  if (ai) {
    const near = ai.named.filter(m => m.share != null && m.share >= 80);
    for (const m of near) important.push(`${m.who} má za měsíc ${m.share} % stropu AI.`);
    const body = ai.users.map(u => rowHtml([cell(escape(u.who)), cell(escape(money(u.cost)), { align: "right", nowrap: true, pad: "7px 0 7px 12px" }), cell(escape(u.features.map(f => `${f.name} ${f.calls}×`).join(", ")), { align: "right", muted: true, pad: "7px 0 7px 12px" })]));
    const monthLine = [...ai.named.map(m => `${m.who} ${money(m.cost)}${m.share != null ? ` (${m.share} %)` : ""}`), ai.others.count ? `${ai.named.length ? "ostatní " : ""}${ai.others.count} ${ai.others.count === 1 ? "účet" : ai.others.count <= 4 ? "účty" : "účtů"} dohromady ${money(ai.others.cost)}` : ""].filter(Boolean).join(" · ");
    const top = Math.min(100, Math.max(0, ...ai.named.map(m => m.share || 0)));
    const bar = ai.limit && ai.named.length ? `<div style="height:8px;background:#e4e4e7;border-radius:4px;margin:6px 0 0"><div style="width:${top}%;height:8px;background:${top >= 80 ? "#ef4444" : top >= 50 ? "#f59e0b" : "#22c55e"};border-radius:4px"></div></div>` : "";
    parts.push(heading(`AI včera: ${money(ai.total)} · ${ai.calls} dotazů${ai.cachedShare != null ? ` · ${ai.cachedShare} % vstupu z cache` : ""}`, near.length ? "orange" : "green")
      + table(null, body) + `<p style="margin:10px 0 0;font-size:14px">Za měsíc${ai.limit ? ` (strop ${escape(usd(ai.limit))} na účet)` : ""}: ${escape(monthLine)}</p>` + bar);
  } else if (aiLines) parts.push(heading("AI", null) + aiLines.split("\n").filter(Boolean).map(line => paragraph(line.replace(/^- /, "• "))).join(""));

  if (accounts) {
    const quiet = /Limity stačí, není potřeba nic měnit/.test(accounts);
    const blocks = accounts.split("\n\n").map((block, i) => {
      const [title, ...lines] = block.split("\n");
      if (i === 0 && /^Účty a AI/.test(title)) return lines.map(line => paragraph(line.replace(/^- /, "• "))).join("");
      if (/^Návrhy/.test(title) && !quiet) for (const line of lines) important.push(`Návrh: ${line.replace(/^- /, "")}`);
      return `<p style="margin:14px 0 6px;font-size:14px;font-weight:700">${escape(title)}</p>` + lines.map(line => paragraph(line.replace(/^- /, "• "))).join("");
    }).join("");
    parts.push(heading("Účty a limity", quiet ? "green" : "orange") + blocks);
  }

  const n = important.length;
  const title = n ? `${n} ${things(n)} k řešení` : "Vše v pořádku";
  const box = n ? `<div style="background:#fef3c7;border-radius:12px;padding:12px 14px;margin:0 0 4px;font-size:14px;line-height:1.5"><b>Dnes důležité</b><br>${important.slice(0, 6).map(item => `• ${escape(item)}`).join("<br>")}${n > 6 ? `<br>• a ${n - 6} dalších níže` : ""}</div>` : "";
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:24px 16px;background:#f4f4f5;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">`
    + `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px">`
    + `<p style="margin:0;font-size:13px;color:#71717a">Aurin · přehled za ${escape(date)} (UTC)</p>`
    + `<p style="margin:6px 0 18px;font-size:20px;font-weight:700">${escape(title)}</p>${box}${parts.join("")}`
    + `<p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">Podrobnosti jsou v Cloudflare → Workers → health-api → Logs.</p>`
    + `</div></body></html>`;
}
