// Recovery sessions the athlete adds to a day's plan from the coach's note:
// a short stretching routine picked for the sport just done (and a sore or
// cramped muscle first, gently), or a sauna. Stored per user and day; the names follow
// the app language of the request.
import { L } from "./lang.js";

// hold: seconds per side (or per hold); reps: for moving drills instead of a hold.
const STRETCHES = {
  hip_flexor: { cs: "Výpad s protažením kyčle", en: "Kneeling hip flexor stretch", hold: 45, sides: true, area: "hips", cueCs: "Koleno na podložce, podsaď pánev a posuň boky vpřed.", cueEn: "Back knee down, tuck the pelvis and shift the hips forward." },
  quad: { cs: "Protažení přední strany stehna", en: "Standing quad stretch", hold: 40, sides: true, area: "quads", cueCs: "Pata k hýždi, kolena u sebe, pánev podsazená.", cueEn: "Heel to glute, knees together, pelvis tucked." },
  hamstring: { cs: "Protažení zadní strany stehna", en: "Hamstring stretch", hold: 45, sides: true, area: "hamstrings", cueCs: "Natažená noha na vyvýšení, předklon s rovnými zády.", cueEn: "Straight leg on a low step, hinge forward with a long back." },
  glute: { cs: "Hýždě vleže (čtyřka)", en: "Lying figure-4 glute stretch", hold: 45, sides: true, area: "glutes", cueCs: "Kotník přes koleno, přitáhni stehno k hrudníku.", cueEn: "Ankle over the knee, pull the thigh towards the chest." },
  calf: { cs: "Lýtko o zeď", en: "Wall calf stretch", hold: 40, sides: true, area: "calves", cueCs: "Zadní noha natažená, pata na zemi.", cueEn: "Back leg straight, heel down." },
  soleus: { cs: "Lýtko s pokrčeným kolenem", en: "Bent-knee calf stretch", hold: 30, sides: true, area: "calves", cueCs: "Jako u zdi, jen zadní koleno lehce pokrč.", cueEn: "As at the wall, with the back knee slightly bent." },
  open_book: { cs: "Rotace hrudníku vleže na boku", en: "Side-lying open book", reps: 8, sides: true, area: "back", cueCs: "Kolena pokrčená, otevírej horní ruku za pohledem.", cueEn: "Knees bent, open the top arm and follow it with your eyes." },
  cat_cow: { cs: "Kočka a kráva", en: "Cat-cow", reps: 10, sides: false, area: "back", cueCs: "Na všech čtyřech střídej kulatá a prohnutá záda s dechem.", cueEn: "On all fours, round and arch the back with your breath." },
  child: { cs: "Dětská pozice", en: "Child's pose", hold: 60, sides: false, area: "back", cueCs: "Hýždě k patám, paže vpřed, klidně dýchej do zad.", cueEn: "Hips to heels, arms forward, breathe into the back." },
  chest: { cs: "Hrudník ve dveřích", en: "Doorway chest stretch", hold: 40, sides: true, area: "chest", cueCs: "Předloktí na zárubni, pomalu se předkloň vpřed.", cueEn: "Forearm on the door frame, lean slowly forward." },
  lats: { cs: "Široký sval zádový u opory", en: "Lat stretch at a support", hold: 40, sides: false, area: "lats", cueCs: "Ruce na opěradle, boky dozadu, hrudník k zemi.", cueEn: "Hands on a chair back, hips back, chest towards the floor." },
  shoulder: { cs: "Rameno přes hrudník", en: "Cross-body shoulder stretch", hold: 30, sides: true, area: "shoulders", cueCs: "Paži přitáhni k hrudníku druhou rukou nad loktem.", cueEn: "Pull the arm across the chest above the elbow." }
};
const ROUTINES = {
  ride: ["hip_flexor", "quad", "hamstring", "glute", "calf", "open_book", "child"],
  run: ["calf", "soleus", "hamstring", "hip_flexor", "quad", "glute", "child"],
  gym_upper: ["chest", "lats", "shoulder", "open_book", "cat_cow", "child"],
  gym_lower: ["hip_flexor", "quad", "hamstring", "glute", "calf", "child"],
  general: ["cat_cow", "hip_flexor", "hamstring", "glute", "chest", "child"]
};

export function recoveryRoutine({ sport = null, focus = "", note = "" } = {}) {
  const text = String(focus) + " " + String(note);
  const key = sport === "ride" || sport === "run" ? sport : sport === "gym" ? (/nohy|dřep|leg|squat|lower|spodn/i.test(text) ? "gym_lower" : "gym_upper") : "general";
  let keys = [...ROUTINES[key]];
  // A sore or cramped muscle goes first, held gently.
  const sore = /lýtk|calf|achil/i.test(text) ? "calves" : /hamstr|zadní stehn/i.test(text) ? "hamstrings" : /záda|back/i.test(text) ? "back" : null;
  if (sore) keys = [...keys.filter(k => STRETCHES[k].area === sore), ...keys.filter(k => STRETCHES[k].area !== sore)];
  if (sore === "calves" && !keys.includes("soleus")) keys.splice(1, 0, "soleus");
  return { kind: "stretch", items: keys.map(k => ({ key: k, gentle: STRETCHES[k].area === sore })) };
}

const seconds = item => { const s = STRETCHES[item.key]; return s ? (s.hold ? s.hold : s.reps * 4) * (s.sides ? 2 : 1) + 10 : 0; };
// The time the move itself takes (both sides), for the app's timer.
const holdSeconds = s => (s.hold ? s.hold : s.reps * 4) * (s.sides ? 2 : 1);
export const SAUNA_MINUTES = 30;
export function describeRecovery(row) {
  const sauna = row.kind === "sauna";
  const items = sauna ? [] : (row.items || []).filter(i => STRETCHES[i.key]).map(i => {
    const s = STRETCHES[i.key];
    return { key: i.key, name: L(s.cs, s.en), dose: s.hold ? s.hold + " s" + (s.sides ? L(" na stranu", " per side") : "") : s.reps + "×" + (s.sides ? L(" na stranu", " per side") : ""), cue: L(s.cueCs, s.cueEn) + (i.gentle ? L(" Jemně a bez bolesti.", " Gently, without pain.") : ""), gentle: Boolean(i.gentle), seconds: holdSeconds(s), sides: Boolean(s.sides) };
  });
  const minutes = sauna ? SAUNA_MINUTES : Math.max(5, Math.round((row.items || []).reduce((a, i) => a + seconds(i), 0) / 60));
  return { id: row.id, date: row.date, kind: row.kind, title: sauna ? "Sauna" : L("Protažení", "Stretching"), minutes, items, done: Boolean(row.done_at), doneAt: row.done_at || null };
}

// The body parts a routine stretches, in its order: "hrudník, záda, ramena".
const AREA_NAMES = { hips: ["kyčle", "hips"], quads: ["stehna", "thighs"], hamstrings: ["stehna", "thighs"], glutes: ["hýždě", "glutes"], calves: ["lýtka", "calves"], back: ["záda", "back"], lats: ["záda", "back"], chest: ["hrudník", "chest"], shoulders: ["ramena", "shoulders"] };
export function routineAreas(items, limit = 3) {
  const names = (items || []).map(i => STRETCHES[i.key]?.area).filter(Boolean).map(a => L(...AREA_NAMES[a]));
  return [...new Set(names)].slice(0, limit);
}

export async function ensureRecoveryTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS recovery_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    items_json TEXT NOT NULL,
    done_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_recovery_sessions_user_date ON recovery_sessions(user_id, date)").run();
}
const parse = r => { let items = []; try { items = JSON.parse(r.items_json) || []; } catch { items = []; } return describeRecovery({ ...r, items }); };

export async function listRecovery(db, { from, to }) {
  await ensureRecoveryTable(db);
  const rows = await db.prepare("SELECT * FROM recovery_sessions WHERE user_id=? AND date>=? AND date<=? ORDER BY date, id").bind(db.userId, from, to).all();
  return (rows.results || []).map(parse);
}

// One stretching session per day: adding again replaces the routine. A sauna
// is its own kind without moves. `done` stores it as already done (the app
// saves a finished routine or sauna straight into the day's plan).
export async function addRecovery(db, { date, sport = null, focus = "", note = "", kind = "stretch", done = false }) {
  await ensureRecoveryTable(db);
  const routine = kind === "sauna" ? { kind: "sauna", items: [] } : recoveryRoutine({ sport, focus, note });
  await db.prepare("DELETE FROM recovery_sessions WHERE user_id=? AND date=? AND kind=? AND done_at IS NULL").bind(db.userId, date, routine.kind).run();
  await db.prepare("INSERT INTO recovery_sessions(user_id,date,kind,items_json,done_at) VALUES(?,?,?,?,?)").bind(db.userId, date, routine.kind, JSON.stringify(routine.items), done ? new Date().toISOString() : null).run();
  return (await listRecovery(db, { from: date, to: date })).filter(r => r.kind === routine.kind).at(-1);
}

export async function updateRecovery(db, id, { done = null, remove = false } = {}) {
  await ensureRecoveryTable(db);
  if (remove) await db.prepare("DELETE FROM recovery_sessions WHERE user_id=? AND id=?").bind(db.userId, id).run();
  else await db.prepare("UPDATE recovery_sessions SET done_at=? WHERE user_id=? AND id=?").bind(done ? new Date().toISOString() : null, db.userId, id).run();
}
