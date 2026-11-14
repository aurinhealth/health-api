// What the coach must be able to do from the chat (coach vision 2026-11-14,
// "Chat v1"): one row per intent, object, sport and athlete state, with the
// evaluation situations that test it (S.. in coach-eval.js, P01.2 = persona 1,
// message 2 in coach-personas.js). A row without a situation is a gap. The
// map is fixed in size before the work, and coverage counts each sport on its
// own, so a small map cannot make it look done. Threads that add a chat action
// add its rows and situations here.
// intent: cancel | move | swap_sport | swap_type | add | remove | lengthen | shorten | easier | harder | focus | undo | confirm | plan_week | advise | refuse
// object: session | exercise | week | plan | food | answer
// state: green | tired | red | sick | pain | chest | cycle | new | abuse
export const SPORTS = ['ride', 'run', 'swim', 'gym'];

const row = (intent, object, sport, state, scenarios = []) => ({ id: `${intent}.${object}.${sport}.${state}`, intent, object, sport, state, scenarios });

export const COACH_CAPABILITIES = [
  // Cancel and move a planned session.
  row('cancel', 'session', 'ride', 'green'), row('cancel', 'session', 'run', 'green', ['P02.1']), row('cancel', 'session', 'swim', 'green'), row('cancel', 'session', 'gym', 'tired', ['P19.3']),
  row('move', 'session', 'ride', 'green', ['P18.2']), row('move', 'session', 'run', 'green', ['P02.2']), row('move', 'session', 'swim', 'green'), row('move', 'session', 'gym', 'green'),
  // Another sport instead, another kind within the sport.
  row('swap_sport', 'session', 'ride', 'green', ['P16.3']), row('swap_sport', 'session', 'run', 'green'), row('swap_sport', 'session', 'swim', 'green', ['P04.1', 'P04.3']), row('swap_sport', 'session', 'gym', 'green'),
  row('swap_type', 'session', 'ride', 'green'), row('swap_type', 'session', 'run', 'green', ['P17.1']), row('swap_type', 'session', 'swim', 'green'), row('swap_type', 'session', 'gym', 'green', ['P07.1']),
  // Length and intensity of a session.
  row('shorten', 'session', 'ride', 'cycle', ['P10.2']), row('shorten', 'session', 'run', 'green', ['P02.3', 'P17.2']), row('shorten', 'session', 'swim', 'green', ['P04.2']), row('shorten', 'session', 'gym', 'green', ['P06.3']),
  row('lengthen', 'session', 'ride', 'green', ['S77']), row('lengthen', 'session', 'run', 'green', ['S79']), row('lengthen', 'session', 'swim', 'green', ['P05.3']), row('lengthen', 'session', 'gym', 'green', ['S74']),
  row('easier', 'session', 'ride', 'red', ['P09.3']), row('easier', 'session', 'run', 'green', ['P02.3']), row('easier', 'session', 'swim', 'green', ['P05.2']), row('easier', 'session', 'gym', 'green', ['S80']),
  row('harder', 'session', 'ride', 'green', ['S78']), row('harder', 'session', 'run', 'green', ['P17.1']), row('harder', 'session', 'swim', 'green'), row('harder', 'session', 'gym', 'green', ['P07.3']),
  // Exercises of a gym session (health-api #1087).
  row('add', 'exercise', 'gym', 'green', ['S72', 'P06.1']), row('remove', 'exercise', 'gym', 'pain', ['S73', 'P06.2']), row('focus', 'session', 'gym', 'green', ['P07.1', 'S75']),
  // Undo and confirm by text.
  row('undo', 'session', 'ride', 'green', ['S81']), row('undo', 'session', 'run', 'green', ['P17.3', 'S82']), row('undo', 'session', 'swim', 'green'), row('undo', 'session', 'gym', 'green', ['S76']),
  row('confirm', 'answer', 'ride', 'green', ['P09.4', 'P18.4']), row('confirm', 'answer', 'run', 'green', ['P02.4']), row('confirm', 'answer', 'swim', 'green', ['P04.4']), row('confirm', 'answer', 'gym', 'green', ['S71', 'P06.4', 'P07.4']),
  // Plan a week.
  row('plan_week', 'week', 'ride', 'new', ['P01.3']), row('plan_week', 'week', 'run', 'new'), row('plan_week', 'week', 'swim', 'green'), row('plan_week', 'week', 'gym', 'green', ['P16.1']),
  // Safety: what the coach refuses or changes on its own.
  row('refuse', 'session', 'ride', 'red', ['S02', 'P09.1', 'P09.2']), row('refuse', 'session', 'ride', 'chest', ['S04', 'P11.2', 'P11.3']), row('refuse', 'session', 'ride', 'sick', ['P08.1']),
  row('refuse', 'session', 'run', 'pain', ['P03.1', 'P03.2']), row('refuse', 'session', 'run', 'new', ['P15.2']), row('refuse', 'session', 'swim', 'green', ['P05.1']), row('refuse', 'session', 'gym', 'pain', ['P06.2']),
  row('refuse', 'answer', 'ride', 'abuse', ['S07', 'P13.2', 'P14.1']),
  // Advice and food.
  row('advise', 'food', 'ride', 'green', ['S05', 'P12.1', 'P12.2']), row('advise', 'food', 'run', 'green'), row('advise', 'food', 'swim', 'green', ['P20.3']), row('advise', 'food', 'gym', 'green')
];

// Rows with at least one situation that exists and checks the row, per sport and in total.
export function capabilityCoverage(ids, map = COACH_CAPABILITIES) {
  const known = new Set(ids), covered = r => r.scenarios.some(id => known.has(id));
  const part = rows => ({ covered: rows.filter(covered).length, total: rows.length });
  return { total: part(map), bySport: Object.fromEntries(SPORTS.map(s => [s, part(map.filter(r => r.sport === s))])), gaps: map.filter(r => !covered(r)).map(r => r.id) };
}
