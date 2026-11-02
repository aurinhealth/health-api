// Knihovna → Tri: bricks, two sports one right after the other (Petr
// 2026-10-30). Each leg is a catalogue workout of the family at the length
// (planWorkoutId, as the training plans pick theirs), so nothing is stored:
// the app plans the legs one by one and joins the second to the first
// (planned-links.js); a joined pair goes to Apple Watch as one multisport
// workout. A run off the bike stays at least 20 min (resizeWorkout's floor).
import { L } from './lang.js';
import { planWorkoutId } from './training-plans.js';
import { getWorkout } from './workout-library.js';
import { athleteSteps } from './workout-explanation.js';

export const BRICKS = [
  { id: 'brick-easy', name: () => L('Lehký brick', 'Easy brick'), note: () => L('Klidná jízda a hned po ní lehký běh: nohy si zvyknou na přechod z kola.', 'An easy ride, then an easy run straight after: your legs learn the switch off the bike.'),
    legs: [['ride', 'z2', 45], ['run', 'run-easy', 20]] },
  { id: 'brick-race', name: () => L('Brick v závodním tempu', 'Race-pace brick'), note: () => L('Tempo na kole a běh, který se zrychlí do závodního tempa, jako v závodě.', 'Tempo on the bike, then a run that builds to race pace, as on race day.'),
    legs: [['ride', 'tempo', 60], ['run', 'run-progression', 20]] },
  { id: 'brick-long', name: () => L('Dlouhý brick', 'Long brick'), note: () => L('Dlouhá klidná jízda a půl hodiny běhu: příprava na polovinu a celý triatlon.', 'A long easy ride and half an hour of running: for a half or full distance.'),
    legs: [['ride', 'z2', 120], ['run', 'run-easy', 30]] },
  { id: 'brick-swim-ride', name: () => L('Plavání a kolo', 'Swim, then ride'), note: () => L('Bazén a hned potom kolo, třeba na trenažéru: první přechod závodu.', 'The pool, then the bike right after, on the home trainer too: the race\'s first switch.'),
    legs: [['swim', 'swim-endurance', 30], ['ride', 'z2', 60]] }
];

// The bricks with each leg's workout and its steps in the athlete's watts and paces.
export async function libraryBricks(db, { environment = 'indoor', thresholds = {} } = {}) {
  const out = [];
  for (const b of BRICKS) {
    const legs = [];
    for (const [sport, family, minutes] of b.legs) {
      const workoutId = planWorkoutId(sport, { family }, minutes);
      const w = workoutId && await getWorkout(db, workoutId);
      if (!w) break;
      let structure = w.structure;
      if (!Array.isArray(structure)) try { structure = JSON.parse(w.structure_json || '[]'); } catch { structure = []; }
      const env = sport === 'swim' ? 'indoor' : environment;
      legs.push({ sport, workoutId, name: w.name, minutes: Math.round(Number(w.duration_minutes) || minutes), ...(w.distance_meters ? { meters: w.distance_meters } : {}), steps: athleteSteps(structure, sport, env, thresholds) });
    }
    if (legs.length === b.legs.length) out.push({ id: b.id, name: b.name(), note: b.note(), minutes: legs.reduce((n, x) => n + x.minutes, 0), legs });
  }
  return out;
}
