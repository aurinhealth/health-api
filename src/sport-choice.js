// "Don't suggest rides" (Aktivita dne's ⋯, the coach chat) and the switches of
// Settings → Sports to suggest: the profile's `sports` without (or with) one
// sport. A profile that never chose starts from all four, so turning one off
// keeps the others on. A main sport turned off stops being a main one.
import { L } from "./lang.js";
import { SPORT_KINDS, sportKinds, mainKindsOf, mainSportOfKinds, normalizeFocus } from "./athlete-focus.js";

export function withSportChoice(profile = {}, kind, suggest) {
  if (!SPORT_KINDS.includes(kind)) throw new Error(L("Neznámý sport.", "Unknown sport."));
  const before = Array.isArray(profile.sports) ? sportKinds(profile.sports) : [...SPORT_KINDS];
  const sports = suggest ? sportKinds([...before, kind]) : before.filter(k => k !== kind);
  const mains = mainKindsOf(profile), mainSports = suggest ? mains : mains.filter(k => k !== kind);
  // The main sport follows the main sports, unless they did not change ("auto" stays).
  const changed = mainSports.length !== mains.length || Array.isArray(profile.mainSports);
  const focus = normalizeFocus({ ...profile, sports, ...(changed ? { mainSports, mainSport: mainSportOfKinds(mainSports) } : {}) });
  return { ...profile, ...focus };
}

// "nenavrhuj mi kolo", "nejezdím na kole", "never suggest cycling", "I don't
// swim": the sport the athlete wants no suggestions of, or null. Only a clear
// no: a passing "no ride today" or a question is not one.
// Whole words, Czech letters included (\b does not know them).
const W = body => new RegExp("(?<![\\p{L}])(?:" + body + ")(?![\\p{L}])", "iu");
const SPORT_WORDS = [
  ["ride", W("kol[oaeu]|kolem|cyklistik\\p{L}*|jízd\\p{L}*|jezdit|jezdím|jezdim|rides?|riding|cycling|bike|biking")],
  ["run", W("běh\\p{L}*|beh\\p{L}*|runs?|running")],
  ["swim", W("plavání|plavani|plavat|plavu|bazén\\p{L}*|bazen\\p{L}*|swims?|swimming")],
  ["strength", W("posilovn\\p{L}*|posilování|posilovani|gym|weights|strength")]
];
const NEVER = new RegExp([
  "nenavrhuj", "nedoporučuj", "nedoporucuj", "nenabízej", "nenabizej", "never suggest", "don'?t suggest", "do not suggest", "stop suggesting",
  "nechci (?:už |uz |nikdy |vůbec |vubec )?(?:jezdit|běhat|behat|plavat|chodit do posilovny|kolo|běh|beh|plavání|plavani|posilovnu)\\b",
  "nejezdím", "nejezdim", "neběhám", "nebeham", "neplavu", "nechodím do posilovny", "nechodim do posilovny",
  "nedělám (?:kolo|cyklistiku|běh|beh|plavání|plavani|posilovnu)", "nedelam (?:kolo|cyklistiku|beh|plavani|posilovnu)", "nemám kolo", "nemam kolo",
  "i (?:don'?t|do not|never) (?:ride|cycle|run|swim|lift|go to the gym|do (?:gym|cycling|running|swimming))\\b", "i don'?t have a bike"
].join("|"), "i");
const TEMPORARY = W("dnes|dneska|zítra|zitra|tento týden|tenhle týden|tento tyden|today|tomorrow|this week|teď|ted|now");
export function sportExclusion(message) {
  const text = String(message || "").trim();
  if (!text || text.length > 300 || /\?\s*$/.test(text) || TEMPORARY.test(text) || !NEVER.test(text)) return null;
  const found = SPORT_WORDS.filter(([, re]) => re.test(text)).map(([kind]) => kind);
  return found.length === 1 ? found[0] : null;
}

// Saves the choice to the profile (row 1 of dashboard_profile, as POST
// /app/api/profile does) and returns the sports as they are now.
export async function saveSportChoice(db, userId, kind, suggest) {
  await db.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id))").run();
  const row = await db.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1").bind(userId).first();
  let saved = {};
  try { saved = row ? JSON.parse(row.profile_json) || {} : {}; } catch { saved = {}; }
  const profile = withSportChoice(saved, kind, Boolean(suggest));
  const was = Array.isArray(saved.sports) ? sportKinds(saved.sports) : [...SPORT_KINDS];
  const changed = was.includes(kind) !== Boolean(suggest);
  if (changed) await db.prepare("INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json").bind(userId, JSON.stringify(profile)).run();
  return { changed, sports: profile.sports, mainSports: mainKindsOf(profile), mainSport: profile.mainSport };
}

// Week plan's sport picker: the sports ticked in Settings → Sports to suggest,
// or null when the athlete never chose (all of them are offered). One row read.
export async function suggestedSports(db, userId) {
  const row = await db.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1").bind(userId).first().catch(() => null);
  try { const p = JSON.parse(row?.profile_json || "null"); return Array.isArray(p?.sports) ? sportKinds(p.sports) : null; } catch { return null; }
}

// A card in a sport the athlete turned off only when they ask for that sport
// in this chat ("dnes bych si dal kolo"); the message that turned it off does not count.
export function sportAllowed(focus, sport, askedTexts = []) {
  const kind = sport === "gym" ? "strength" : sport;
  if (!Array.isArray(focus?.sports) || focus.sports.includes(kind)) return true;
  const re = SPORT_WORDS.find(([k]) => k === kind)?.[1];
  return Boolean(re) && askedTexts.some(t => t && !sportExclusion(t) && !NEVER.test(String(t)) && re.test(String(t)));
}
