// Is a ride or run a quality (hard) session, judged from its name? Shared by
// the coaches, the daily summary and the gym, so a "Norský 4×4", "Billat
// 30-30", "Rønnestad 30/15" or "4×4 VO₂" counts as hard everywhere.
const fold = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/₂/g, "2").replace(/ø/gi, "o").toLowerCase();

const HIGH = /vo2|anaerob|sprint|tabata|billat|norsk|ronnestad|microburst|\b(30|40)\s*[/-]\s*(15|20|30)\b|\b4\s*[x×]\s*4\b|hill rep|kopc|yasso/;
const MODERATE = /threshold|\bprah|ftp\b|sweet.?spot|over.?under|seiler|cruise|torque|double threshold|race pace|zavod|\brace\b|interval|fartlek|\busek/;
const EASY = /endurance|\bz[12]\b|recovery|regenera|easy|lehk|aerob|rozjet|vyjet|long ride|dlouh/;
// "5×6 min", "3x10", "10×1000 m": repeats of work.
const REPEATS = /\b\d+\s*[x×]\s*\d+/;

// "high" (VO₂max, anaerobic), "moderate" (threshold, sweet spot, tempo for a
// run), or null for an easy session. Tempo makes a run hard, not a ride.
export function qualityDomain(name, sport = "ride") {
  const s = fold(name);
  if (!s.trim()) return null;
  if (/double threshold/.test(s)) return "moderate";
  if (HIGH.test(s)) return "high";
  if (MODERATE.test(s)) return "moderate";
  if (sport === "run" && /tempo/.test(s)) return "moderate";
  if (REPEATS.test(s) && !EASY.test(s)) return "moderate";
  return null;
}
export const isQualityName = (name, sport = "ride") => qualityDomain(name, sport) != null;
