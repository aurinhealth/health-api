// Hard (quality) training, one definition for the coaches, the week plan, the
// library, the chat's checks, Today and the gym: tempo, sweet spot, threshold,
// VO₂max, anaerobic and sprint work, a race or a test, whether it comes as a
// kind ("tempo"), a library workout (primary_system), a planned or done
// session (its name and tags, else its intensity or load) or a name, so a
// "Norský 4×4", "Billat 30-30", "Rønnestad 30/15" or "4×4 VO₂" counts as hard
// everywhere. Tempo is hard in both sports: the coach prescribes it as
// intensity (none on a yellow day, 48 h from a hard day), so a tempo ride done
// or planned is a hard day too. Endurance, long and recovery are easy.
const fold = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/₂/g, "2").replace(/ø/gi, "o").toLowerCase();
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

const HIGH = /vo2|anaerob|sprint|tabata|billat|norsk|ronnestad|microburst|\b(30|40)\s*[/-]\s*(15|20|30)\b|\b4\s*[x×]\s*4\b|hill rep|kopc|yasso/;
const MODERATE = /threshold|\bprah|ftp\b|sweet.?spot|tempo|over.?under|seiler|cruise|torque|double threshold|race pace|zavod|\brace\b|\btest\b|interval|fartlek|\busek/;
const EASY = /endurance|\bz[12]\b|recovery|regenera|easy|lehk|aerob|rozjet|vyjet|long ride|dlouh/;
// "5×6 min", "3x10", "10×1000 m": repeats of work.
const REPEATS = /\b\d+\s*[x×]\s*\d+/;

// A name: "high" (VO₂max, anaerobic, sprint), "moderate" (threshold, sweet
// spot, tempo, a race; hills for a run), or null for an easy session.
export function qualityDomain(name, sport = "ride") {
  const s = fold(name);
  if (!s.trim()) return null;
  if (/double threshold/.test(s)) return "moderate";
  if (HIGH.test(s)) return "high";
  if (MODERATE.test(s)) return "moderate";
  if (sport === "run" && /hill/.test(s)) return "moderate";
  if (REPEATS.test(s) && !EASY.test(s)) return "moderate";
  return null;
}
export const isQualityName = (name, sport = "ride") => qualityDomain(name, sport) != null;

// The kinds and library systems (workout-library.js SYSTEMS, week-ai.js KINDS,
// the coach's session kinds). Race and openers are kinds of their own.
const KIND_CLASS = { recovery: null, endurance: null, long: null, long_endurance: null, tempo: "moderate", sweet_spot: "moderate", threshold: "moderate", vo2: "high", vo2max: "high", anaerobic: "high", sprint: "high" };
export const HARD_KINDS = new Set(Object.keys(KIND_CLASS).filter(k => KIND_CLASS[k]));
export const isHardKind = kind => HARD_KINDS.has(kind);
const knownKind = kind => typeof kind === "string" && Object.hasOwn(KIND_CLASS, kind);

const sportOf = a => {
  const s = fold(a.sport), t = fold(`${a.type ?? ""} ${a.activity_type ?? ""}`);
  if (/^(run|running)$/.test(s)) return "run";
  if (/^(ride|cycling)$/.test(s)) return "ride";
  return /run|beh|jog|treadmill/.test(t) ? "run" : /ride|cycl|bike|kolo/.test(t) ? "ride" : null;
};
const sportArg = sport => (sport === "ride" || sport === "run" ? sport : null);
const textOf = a => [a.name, a.title, a.workout_type, a.workoutType, a.intensity_label, a.intensityLabel, ...[].concat(a.tags ?? [])].filter(x => typeof x === "string").join(" ");

// "high", "moderate" or null: a kind decides, else the name and tags; an
// Intervals.icu race event (RACE_A/B/C) is a race.
export function intensityClass(a, sport) {
  if (a == null) return null;
  sport = sportArg(sport);
  if (typeof a !== "object") return knownKind(a) ? KIND_CLASS[a] : qualityDomain(a, sport ?? "ride");
  const kind = a.kind ?? a.primary_system ?? a.system;
  if (knownKind(kind)) return KIND_CLASS[kind];
  if ([a.type, a.category].some(t => /^race_[abc]$/i.test(String(t ?? "")))) return "moderate";
  return qualityDomain(textOf(a), sport ?? sportOf(a) ?? "ride");
}

// A ride or run without a telling name: by its intensity factor (NP/FTP for a
// ride) or how dense its load is.
function hardByLoad(a, sport) {
  const p = a.payload && typeof a.payload === "object" ? a.payload : {}, tss = num(a.tss) ?? 0, hours = num(a.durationHours) ?? 0;
  const raw = num(a.intensityFactor ?? p.icu_intensity), factor = raw > 3 ? raw / 100 : raw;
  if (sport === "run") return factor >= 0.88 || (tss >= 50 && hours > 0 && hours <= 1.5 && tss / hours >= 75);
  if (sport !== "ride") return false;
  const np = num(a.normalizedPower ?? p.icu_weighted_average_watts), ftp = num(a.ftp ?? p.icu_ftp);
  return (np && ftp ? np / ftp : factor) >= 0.86 || (tss >= 100 && hours <= 1.75);
}

// Is it hard? An explicit flag (intensity / is_intensity) wins; sport is
// "ride" or "run", else taken from the session's sport or type (so it also
// works as a filter callback).
export function isHardSession(a, sport) {
  if (a == null) return false;
  if (typeof a !== "object") return intensityClass(a, sport) != null;
  for (const flag of [a.intensity, a.is_intensity]) if (typeof flag === "boolean") return flag;
  sport = sportArg(sport) ?? sportOf(a);
  return intensityClass(a, sport) != null || hardByLoad(a, sport);
}
