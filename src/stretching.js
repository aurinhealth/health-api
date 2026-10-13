import { L } from './lang.js';

// Stretching at the end of a gym session: a few static stretches for the
// muscles the session worked hardest, then the child's pose to finish.
// About five minutes; held, not bounced (seconds per side where `sides`).
const STRETCHES = [
  { id: 'hip_flexor', cs: 'Kyčelní flexory u zdi', en: 'Kneeling hip flexor stretch', muscles: ['quads', 'glutes'], seconds: 30, sides: true },
  { id: 'hamstring', cs: 'Zadní strana stehen', en: 'Hamstring stretch', muscles: ['hamstrings', 'lower_back'], seconds: 30, sides: true },
  { id: 'quad', cs: 'Přední strana stehen ve stoje', en: 'Standing quad stretch', muscles: ['quads'], seconds: 30, sides: true },
  { id: 'figure_four', cs: 'Hýždě vleže (čtyřka)', en: 'Figure-four glute stretch', muscles: ['glutes', 'abductors'], seconds: 30, sides: true },
  { id: 'calf', cs: 'Lýtka u zdi', en: 'Wall calf stretch', muscles: ['calves'], seconds: 30, sides: true },
  { id: 'frog', cs: 'Žabka', en: 'Frog stretch', muscles: ['adductors'], seconds: 45, sides: false },
  { id: 'doorway', cs: 'Hrudník ve dveřích', en: 'Doorway chest stretch', muscles: ['chest', 'shoulders'], seconds: 30, sides: false },
  { id: 'lat', cs: 'Široký sval zádový u lavice', en: 'Bench lat stretch', muscles: ['back'], seconds: 30, sides: false },
  { id: 'triceps', cs: 'Triceps za hlavou', en: 'Overhead triceps stretch', muscles: ['triceps'], seconds: 30, sides: true },
  { id: 'biceps', cs: 'Biceps a předloktí u zdi', en: 'Wall biceps stretch', muscles: ['biceps', 'forearms'], seconds: 30, sides: true },
  { id: 'cross_body', cs: 'Rameno přes hrudník', en: 'Cross-body shoulder stretch', muscles: ['rear_delts', 'side_delts', 'shoulders'], seconds: 30, sides: true },
  { id: 'neck', cs: 'Krk do strany', en: 'Neck side stretch', muscles: ['traps'], seconds: 20, sides: true },
  { id: 'cobra', cs: 'Kobra', en: 'Cobra stretch', muscles: ['core'], seconds: 30, sides: false }
];
const FINISH = { id: 'child', cs: 'Dětská pozice', en: "Child's pose", muscles: ['back', 'lower_back'], seconds: 45, sides: false };
// Moving into the next stretch.
const TRANSITION_SECONDS = 10;

const itemSeconds = s => s.seconds * (s.sides ? 2 : 1) + TRANSITION_SECONDS;

/**
 * The stretches for a session's work sets (`muscleOf` maps an exercise to its
 * main muscle): the muscles with the most sets first, `count` stretches and
 * the child's pose. Null without any work set.
 */
export function stretchingFor(rows, muscleOf, { count = 4 } = {}) {
  const sets = new Map();
  for (const r of rows || []) {
    if (r?.[0] !== 'WORK') continue;
    const muscle = muscleOf(r[1]);
    if (muscle) sets.set(muscle, (sets.get(muscle) || 0) + 1);
  }
  if (!sets.size) return null;
  const score = s => s.muscles.reduce((sum, m, i) => sum + (sets.get(m) || 0) * (i ? 0.5 : 1), 0);
  const picked = STRETCHES.map((s, order) => ({ s, score: score(s), order })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order).slice(0, count).map(x => x.s);
  const items = [...picked, FINISH];
  const seconds = items.reduce((sum, s) => sum + itemSeconds(s), 0);
  return {
    minutes: Math.ceil(seconds / 60),
    seconds,
    items: items.map(s => ({ id: s.id, name: L(s.cs, s.en), seconds: s.seconds, sides: s.sides }))
  };
}

// The stretching lives in the stored plan's sixth row (values[5]), which the
// older layout left empty: ["Protažení", "<json>"].
export const STRETCHING_ROW = 5;
export function stretchingRow(stretching) {
  return stretching?.items?.length ? ['Protažení', JSON.stringify({ minutes: stretching.minutes, items: stretching.items })] : [];
}
export function readStretching(values) {
  const row = Array.isArray(values) ? values[STRETCHING_ROW] : null;
  if (!Array.isArray(row) || row[0] !== 'Protažení') return null;
  try {
    const parsed = JSON.parse(row[1]);
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch { return null; }
}
