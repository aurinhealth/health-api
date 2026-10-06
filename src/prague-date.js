// Today's date in Prague ("2026-10-05"). Between midnight and 1–2 am the UTC
// date is still yesterday, so a meal logged then or a plan made then would
// land on the wrong day.
export function pragueToday(at = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  return p.find(x => x.type === "year").value + "-" + p.find(x => x.type === "month").value + "-" + p.find(x => x.type === "day").value;
}
