// The cards beside each scene's phone on the overview (site-pages.js). The phone shows the app's
// screen; its card shows the next detail a tap or a scroll away in the app, redrawn with the sample
// day's numbers (ios-native/Loadwise/Data/DemoData.swift, in English) so it stays sharp and can
// move. Each card plays once when its step comes into view (.part.on); with reduced motion, or
// without JS, it simply shows its final state.
import {ICON_PATHS} from './icons.js';

const svg = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
const tick = '<svg class="ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const head = (k, title = '') => `<div class="k">${k}</div>${title ? `<div class="h">${title}</div>` : ''}`;

// A line through values, scaled into a w×h box: the points of an SVG polyline.
const line = (values, w, h, lo, hi) => values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - (v - lo) / (hi - lo) * h).toFixed(1)}`).join(' ');

// Sleep consistency, 14 nights: when you fell asleep (Sleep → Consistency). The scale runs from
// 11:00 PM to 12:30 AM; the band is the usual 11:18 PM–12:18 AM.
const NIGHTS = [['Fr', 54], ['Sa', 36], ['Su', 80], ['Mo', 50], ['Tu', 32], ['We', 39], ['Th', 46], ['Fr', 53], ['Sa', 80], ['Su', 42], ['Mo', 49], ['Tu', 31], ['We', 38], ['Th', 48]];
const clock = m => m >= 60 ? `12:${String(m - 60).padStart(2, '0')} AM` : `11:${String(m).padStart(2, '0')} PM`;
const consistency = `${head('Consistency · 14 nights', 'You usually fall asleep between 11:18 PM and 12:18 AM.')}
<div class="nights">${NIGHTS.map(([d, m], i) => `<div class="nr${m > 78 ? ' late' : ''}" style="--i:${i}"><span>${d}</span><span class="tr"><b style="left:${(m / 90 * 100).toFixed(1)}%"></b></span><span>${clock(m)}</span></div>`).join('')}</div>`;

// Need for tonight → the bedtime it sets: 8 h 30 from 10:10 PM to 7:15 AM (the dial on Bedtime).
const arc = (from, to, r = 70) => {
  const p = a => [(90 + r * Math.sin(a * Math.PI / 180)).toFixed(1), (90 - r * Math.cos(a * Math.PI / 180)).toFixed(1)];
  const [x1, y1] = p(from), [x2, y2] = p(to);
  return `M${x1} ${y1}A${r} ${r} 0 ${(to - from + 360) % 360 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};
// Hours on a 24-hour dial, midnight on top: 10:10 PM is 305°, 7:15 AM is 108.75°.
const BED = 305, WAKE = 108.75;
const sun = a => `translate(${(90 + 70 * Math.sin(a * Math.PI / 180)).toFixed(1)} ${(90 - 70 * Math.cos(a * Math.PI / 180)).toFixed(1)})`;
const dial = `${head('Need for tonight · 8:30', 'Aurin turns it into a bedtime.')}
<div class="dial"><svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="70" class="tk"/><path class="arc" pathLength="1" d="${arc(BED, WAKE + 360)}"/>
<g transform="${sun(BED)}"><circle r="11" class="moon"/><path d="M3 -4a5 5 0 1 0 1.5 7.5 4 4 0 0 1-1.5-7.5Z" class="mi"/></g>
<g transform="${sun(WAKE)}" class="sunk"><circle r="11" class="sun"/><circle r="3.5" class="si"/></g>
<text x="90" y="92" class="big">8 h 30</text><text x="90" y="110" class="sm">sleep</text></svg>
<div class="times"><div><span>${svg('moon')}Bedtime</span><b>10:10 PM</b></div><div><span>${svg('today')}Wake up</span><b>7:15 AM</b></div></div></div>`;

// Bedtime → Alarm: the two switches turn on.
const alarm = `${head('Alarm', 'Wake up at 7:15 AM.')}
<div class="rows">${[['Weekdays', 'Monday to Friday'], ['Weekend', 'Saturday and Sunday']].map(([t, s], i) => `<div class="row" style="--i:${i}"><div><b>${t}</b><small>${s}</small></div><i class="sw"></i></div>`).join('')}</div>`;

// Tonight I want: each choice moves the bedtime (wake at 7:15 AM, 35 minutes to fall asleep and wake).
const goal = `${head('Tonight I want')}
<div class="chips"><i class="pick"></i>${[['Catch up', '8 h 30'], ['As usual', '8 h 00'], ['At least', '7 h 00']].map(([t, s]) => `<div><b>${t}</b><small>${s}</small></div>`).join('')}</div>
<div class="bed"><span>${svg('moon')}Bedtime</span><b class="roll"><span>10:10 PM</span><span>10:40 PM</span><span>11:40 PM</span><span>10:10 PM</span></b></div>`;

// Readiness → HRV: last night against your normal, by night (HRV detail).
const HRV = [55, 62, 60, 58, 56, 54, 61, 59, 57, 55, 62, 60, 58, 56, 54, 61, 59, 57, 55, 62, 60, 58, 56, 54, 61, 59, 57, 55, 62, 64];
const hrv = `${head('HRV by night')}
<div class="num"><b>64</b><span>ms</span><em class="up">↑ above normal</em></div>
<svg class="chart" viewBox="0 0 380 120" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="${(120 - (61 - 50) / 16 * 120).toFixed(1)}" width="380" height="${(6 / 16 * 120).toFixed(1)}" class="band"/>
<polyline pathLength="1" class="ln" points="${line(HRV, 380, 120, 50, 66)}"/><circle cx="380" cy="${(120 - 14 / 16 * 120).toFixed(1)}" r="5" class="dot"/></svg>
<div class="cells"><div><small>7 days</small><b>59</b></div><div><small>Normal (60 days)</small><b>58</b></div><div><small>Your normal</small><b>55–61</b></div></div>`;

// Journal: ticking off a sauna, with its minutes and temperature.
const journal = `${head('Journal · Thursday')}
<div class="rows">${['Alcohol', 'Late meal'].map(t => `<div class="row"><b>${t}</b><i class="cb"></i></div>`).join('')}
<div class="row on"><b>Sauna</b><i class="cb">${tick}</i></div></div>
<div class="more"><div class="f"><small>Minutes</small><b>15</b></div><div class="f"><small>Temperature</small><div class="seg"><span>70…</span><span>80…</span><span class="sel">90…</span></div></div></div>`;

// Strain → Fitness and fatigue: building, fatigue above fitness (84 days).
const FIT = [53.7, 54, 54.3, 54.6, 54.9, 55.2, 55.5, 55.8, 56.1, 56.4, 56.7, 57, 57.3, 57.6, 57.9, 58.2, 58.5, 58.8, 59.1, 59.4, 59.7, 60, 60.3, 60.6, 60.9, 61.2, 61.5, 61.8, 62];
const TIRED = [64.1, 59.9, 55.7, 54.6, 57.7, 62.9, 67, 67.2, 63.7, 59.1, 56.7, 58.5, 63.4, 68.2, 69.8, 67.3, 62.7, 59.3, 59.7, 63.8, 69, 71.9, 70.8, 66.5, 62.3, 64.3, 67.4, 72.6, 75.6];
const form = `${head('Fitness and fatigue')}
<div class="legend"><span style="--c:var(--green)"><i></i>Fitness 62</span><span style="--c:var(--amber-bar)"><i></i>Fatigue 76</span><span class="form">Form −14 · building</span></div>
<svg class="chart" viewBox="0 0 380 130" preserveAspectRatio="none" aria-hidden="true"><polyline pathLength="1" class="ln f2" points="${line(TIRED, 380, 130, 50, 78)}"/><polyline pathLength="1" class="ln f1" points="${line(FIT, 380, 130, 50, 78)}"/></svg>
<p class="note">Fatigue is above fitness, just as it should be while building. Fitness is growing.</p>`;

// Training → Library: pick a length and a type, then the suggestion.
const library = `${head('Library · Rides')}
<small class="lb">Length</small><div class="pills">${['Recommended', '1 h', '1 h 30 min', '2 h', '3 h'].map((t, i) => `<span${i === 2 ? ' class="sel"' : ''}>${t}</span>`).join('')}</div>
<small class="lb">Type</small><div class="pills">${['Recommended', 'Recovery', 'Endurance', 'Tempo', 'Sweet spot', 'Threshold', 'VO2max'].map((t, i) => `<span${i === 4 ? ' class="sel s2"' : ''}>${t}</span>`).join('')}</div>
<div class="btn">${svg('spark')}Suggest a workout for today</div>`;

// Gym builder → Muscle fatigue: the tired muscles and what tired them.
const fatigue = `${head('Muscle fatigue')}
<div class="mus">${[['Glutes', 26, 'in 2 days', 'Barbell back squat · Monday'], ['Hamstrings', 35, 'in 2 days', 'DB Romanian deadlift · Monday'], ['Quads', 37, '≈ in 2 days', 'Run 14 km · yesterday'], ['Calves', 47, '≈ tomorrow', 'Run 14 km · yesterday']].map(([n, p, w, f], i) =>
  `<div class="m" style="--i:${i}"><div class="t"><b>${n}</b><span>${p} % rested · ${w}</span></div><div class="bar"><i style="--w:${p}%"></i></div><small>${f}</small></div>`).join('')}</div>`;

// Gym day → its exercises: squat, then the bench press and rows as a superset.
const exercises = `${head('Exercises · 3')}
<div class="ex">${[['Squat', 'Warm-up + 3 sets · 80 kg × 6–8'], ['Bench press', '2 sets · 62.5 kg × 8–10'], ['Bent-over rows', '2 sets · 50 kg × 10']].map(([n, s], i) =>
  `<div class="e${i ? ' ss' : ''}" style="--i:${i}"><span class="ic">${svg('gym')}</span><div><b>${n}</b><small>${s}</small></div></div>`).join('')}<i class="sup"></i><small class="sl">Superset A</small></div>`;

// Training mode → a set's weight, changed before the set.
const weight = `${head('Squat · set 2', 'Change the weight if you need to.')}
<div class="fields"><div class="fd on"><small>KG</small><b class="type" data-type="82.5">82.5</b></div><div class="fd"><small>REPS</small><b>8</b></div></div>
<div class="btn dark">${tick}Set done</div>`;

// Training mode → the letter of a set: how hard it was.
const LETTERS = [['W', 'Warm-up', 'Minimal effort', 'var(--muted)'], ['E', 'Easy', 'Mild effort, clean reps', 'var(--green)'], ['M', 'Moderate', 'Challenging, stay focused', 'var(--indigo)'], ['H', 'High', 'Very hard, near the limit', 'var(--amber)'], ['F', 'Failure', 'Not one more rep', '#C2362B'], ['D', 'Drop set', 'Lighter weight, no rest', '#B83A6E']];
const letters = `${head('Set 2', '')}
<div class="lt">${LETTERS.map(([l, n, h, c]) => `<div class="l${l === 'M' ? ' on' : ''}" style="--c:${c}"><span>${l}</span><div><b>${n}</b><small>${h}</small></div></div>`).join('')}</div>`;

// Training mode → the rest on the lock screen (the Live Activity).
const lock = `<div class="lock"><div class="lt9">9:41</div><div class="la"><div class="top"><span class="mark"></span><span>${svg('calendar', 'i s')}12:48</span><span class="hr">${svg('heart', 'i s')}128</span><em>exercise 1 of 3</em></div>
<div class="mid"><div><small>REST</small><b class="count" data-count="84">1:24</b></div><div class="nx"><small>Next · set 3 of 3</small><b>Squat</b><span>80 kg × 8</span></div></div>
<div class="seg3"><i style="--w:50%"></i><i></i><i></i></div><div class="bt"><span>+30 s</span><span class="dk">Skip rest</span></div></div></div>`;

// Training mode → after Rate: a thumb for each exercise and how the plan suited you.
const rate = `${head('Rate', 'How was the workout?')}
<div class="rows">${['Squat', 'Bench press', 'Bent-over rows'].map((n, i) => `<div class="row th" style="--i:${i}"><b>${n}</b><span class="up${i < 2 ? ' on' : ''}">👍</span><span class="dn">👎</span></div>`).join('')}</div>
<div class="fits">${[['👍', 'Suited me'], ['😐', 'It’s OK'], ['👎', 'Didn’t suit me']].map(([e, t], i) => `<div${i === 0 ? ' class="on"' : ''}><span>${e}</span><b>${t}</b></div>`).join('')}</div>`;

// Nutrition → why the target is 2,650 today, and what each meal has left.
const target = `${head('Today’s target')}
<div class="sum"><div><small>Rest day</small><b>2,300</b></div><span>+</span><div class="tr2"><small>Training</small><b>350</b></div><span>=</span><div><small>Today</small><b>2,650</b></div></div>
<div class="meals">${[['Breakfast', '430', '660'], ['Morning snack', '105', '270'], ['Lunch', '845', '800'], ['Afternoon snack', 'about 360', ''], ['Dinner', 'about 910', '']].map(([n, k, t], i) =>
  `<div class="ml${t ? '' : ' sug'}" style="--i:${i}"><b>${n}</b><span>${k}${t ? ` <em>/ ${t} kcal</em>` : ' kcal'}</span></div>`).join('')}</div>`;

// Nutrition → Edit +: Barcode goes from More into what + shows.
const editPlus = `<div class="nav"><span>Cancel</span><b>Edit +</b><span class="done">Done</span></div>
<small class="lb">Shown</small><div class="list">${[['camera', 'Photo of meal'], ['spark', 'Search food'], ['drop', 'Drinks']].map(([i, t], k) => `<div class="row${k ? '' : ' more2'}"><span class="ic">${svg(i)}</span>${t}<em>≡</em></div>`).join('')}
<div class="row new"><span class="ic">${svg('barcode')}</span>Barcode<em>≡</em></div></div>
<small class="lb">More</small><div class="list">${[['barcode', 'Barcode', 'go'], ['camera', 'Food from photos', 'more2'], ['meal', 'Label'], ['scale', 'Log weight']].map(([i, t, c]) => `<div class="row${c ? ' ' + c : ''}"><span class="add">+</span><span class="ic">${svg(i)}</span>${t}</div>`).join('')}</div>`;

// Coach: a question typed, the answer from today's data with the workout it suggests.
const coach = `<div class="chat"><div class="me"><span class="type" data-type="How should I train today?">How should I train today?</span></div>
<div class="ai"><p>Strength, full body at 5:30 PM, 45 minutes. Why today: high readiness, legs rested since Monday, a longer run on Saturday.</p>
<div class="wk"><span class="ic">${svg('gym')}</span><div><b>Strength, full body</b><small>Today · 5:30 PM · 45 min</small></div></div></div></div>
<div class="field">Message the coach…<i>${svg('up')}</i></div>`;

export const DETAILS = {
  'sleep-stages': ['consistency', consistency], 'sleep-need': ['dialc', dial], 'sleep-dial': ['alarm', alarm], 'sleep-why': ['goal', goal],
  'ready-parts': ['hrv', hrv], 'ready-impact': ['journal', journal], 'strain-gauge': ['form', form], 'week': ['library', library],
  'build-form': ['fatigue', fatigue], 'gym-parts': ['exercises', exercises], 'tm-table': ['weight', weight], 'tm-current': ['letters', letters],
  'tm-rest': ['lockc', lock], 'tm-done': ['rate', rate], 'food-top': ['target', target], 'food-add': ['editplus', editPlus], 'coach-ask': ['coach', coach]
};

export const detailCard = part => {
  const [kind, html] = DETAILS[part];
  return `<div class="dc ${kind}">${html}</div>`;
};

// Sizes are the stage's (760×702, scaled to the window), so they read on a phone as well.
export const detailCss = `
.part{padding:0}
.dc{padding:22px 24px 24px;font-size:15px;color:var(--text)}
.dc .k{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.dc .h{font:400 22px/1.2 Newsreader,"New York",Georgia,serif;letter-spacing:-.01em;margin:6px 0 14px}
.dc .i{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.dc .ok{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}
.dc small{display:block;font-size:13px;color:var(--muted)}
.dc .lb{margin:14px 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.dc .row{display:flex;align-items:center;gap:12px;min-height:48px;border-bottom:1px solid var(--line)}
.dc .row:last-child{border-bottom:0}
.dc .row b{flex:1;font-weight:600}
.dc .btn{display:flex;align-items:center;justify-content:center;gap:8px;height:50px;margin-top:16px;border-radius:99px;background:var(--green);color:#fff;font-weight:600}
.dc .btn.dark{background:var(--button)}
.dc .btn .i{width:18px;height:18px}
.dc .ic{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:11px;background:var(--panel2);color:var(--amber)}
.dc .chart{display:block;width:100%;overflow:visible}
.dc .ln{fill:none;stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}

.consistency .nights{display:grid;gap:3px}
.consistency .nr{display:grid;grid-template-columns:28px 1fr 74px;align-items:center;gap:8px;height:16px;font-size:12.5px;color:var(--muted)}
.consistency .nr span:last-child{text-align:right;color:var(--sec);font-variant-numeric:tabular-nums}
.consistency .tr{position:relative;height:100%;background:linear-gradient(90deg,transparent 20%,color-mix(in srgb,var(--lilac) 70%,var(--panel)) 20%,color-mix(in srgb,var(--lilac) 70%,var(--panel)) 86.7%,transparent 86.7%);border-radius:3px}
.consistency .tr b{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--indigo)}
.consistency .late .tr b{background:var(--amber-bar)}.consistency .late span:last-child{color:var(--amber)}

.dialc .dial{display:flex;align-items:center;gap:18px}
.dialc svg{width:190px;flex:none}
.dialc .tk{fill:none;stroke:var(--track);stroke-width:14}
.dialc .arc{fill:none;stroke:var(--indigo);stroke-width:14;stroke-linecap:round}
.dialc .moon{fill:#fff;stroke:var(--line)}.dialc .mi{fill:var(--indigo)}.dialc .sun{fill:#fff;stroke:var(--line)}.dialc .si{fill:var(--amber-bar)}
.dialc .big{font:400 30px Newsreader,Georgia,serif;text-anchor:middle;fill:var(--text)}.dialc .sm{font-size:12px;text-anchor:middle;fill:var(--muted)}
.dialc .times{display:grid;gap:10px;flex:1}
.dialc .times div{padding:12px 14px;border-radius:16px;background:var(--panel2)}
.dialc .times span{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.dialc .times b{display:block;font:400 26px/1.2 Newsreader,Georgia,serif;margin-top:2px}
.dialc .times div:first-child .i{color:var(--indigo)}.dialc .times div:last-child .i{color:var(--amber-bar)}

.alarm .row small{margin-top:2px}.alarm .row b{display:block}.alarm .row>div{flex:1}
.alarm .sw{position:relative;width:52px;height:32px;border-radius:99px;background:var(--green)}
.alarm .sw::after{content:"";position:absolute;top:3px;left:23px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.18)}

.goal .chips{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.goal .chips div{position:relative;z-index:1;padding:10px 0;text-align:center;border-radius:16px;background:color-mix(in srgb,var(--panel2) 60%,transparent)}
.goal .chips b{display:block;font-weight:600}
.goal .pick{position:absolute;z-index:2;left:0;top:0;width:calc((100% - 16px) / 3);height:100%;border-radius:16px;border:1.5px solid var(--indigo);background:color-mix(in srgb,var(--lilac) 45%,transparent)}
.goal .bed{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding:14px 16px;border-radius:16px;background:var(--panel2)}
.goal .bed span{display:flex;align-items:center;gap:6px;color:var(--muted)}.goal .bed .i{color:var(--indigo)}
.goal .roll{position:relative;display:block;height:34px;overflow:hidden;font:400 28px/34px Newsreader,Georgia,serif}
.goal .roll span{display:block;text-align:right}
.goal .roll span:not(:last-child){display:none}

.hrv .num{display:flex;align-items:baseline;gap:6px;margin:4px 0 10px}
.hrv .num b{font:400 44px/1 Newsreader,Georgia,serif}.hrv .num span{color:var(--muted)}.hrv .num em{margin-left:auto;font-style:normal;font-weight:600;font-size:14px}
.hrv .band{fill:var(--green-soft)}.hrv .ln{stroke:var(--green)}.hrv .dot{fill:var(--green);stroke:#fff;stroke-width:2}
.hrv .cells{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.hrv .cells b{font:400 24px Newsreader,Georgia,serif}

.journal .rows{margin-top:8px}
.journal .cb{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;border:1.5px solid color-mix(in srgb,var(--text) 22%,var(--bg))}
.journal .on .cb{background:var(--green);border-color:var(--green)}
.journal .more{display:grid;grid-template-columns:90px 1fr;gap:10px;margin-top:8px}
.journal .f{padding:10px 12px;border-radius:14px;background:var(--panel2)}
.journal .f b{font:400 24px Newsreader,Georgia,serif}
.journal .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px}
.journal .seg span{padding:5px 0;text-align:center;border-radius:9px;font-size:14px;color:var(--sec)}
.journal .seg .sel{background:var(--panel);color:var(--text);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.1)}

.form .legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0 12px;font-size:14px;font-weight:600}
.form .legend span{display:inline-flex;align-items:center;gap:6px}.form .legend i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.form .legend .form{color:var(--amber);font-weight:500}
.form .f1{stroke:var(--green)}.form .f2{stroke:var(--amber-bar)}
.form .note{margin-top:12px;font-size:14px;color:var(--sec)}

.library .pills{display:flex;flex-wrap:wrap;gap:6px}
.library .pills span{padding:7px 12px;border-radius:99px;background:var(--panel2);font-size:14px;color:var(--sec)}
.library .pills .sel{background:var(--text);color:var(--bg);font-weight:600}

.fatigue .mus{display:grid;gap:12px;margin-top:12px}
.fatigue .t{display:flex;justify-content:space-between;align-items:baseline}
.fatigue .t b{font-weight:600}.fatigue .t span{font-size:13.5px;color:var(--rust);font-weight:600}
.fatigue .bar{height:7px;margin:6px 0 4px;border-radius:9px;background:var(--track);overflow:hidden}
.fatigue .bar i{display:block;width:var(--w);height:100%;border-radius:9px;background:var(--rust)}

.exercises .ex{position:relative;display:grid;gap:10px;margin-top:14px}
.exercises .e{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:var(--panel2)}
.exercises .e b{font-weight:600}
.exercises .ss{margin-left:26px}
.exercises .sup{position:absolute;left:4px;top:84px;bottom:22px;width:14px;border:2px solid var(--amber-bar);border-right:0;border-radius:10px 0 0 10px}
.exercises .sl{position:absolute;right:0;top:-30px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber)}

.weight .fields{display:grid;grid-template-columns:1.3fr 1fr;gap:10px}
.weight .fd{padding:12px 16px;border-radius:16px;background:var(--panel2)}
.weight .fd b{display:block;font:400 40px/1.15 Newsreader,Georgia,serif;font-variant-numeric:tabular-nums}
.weight .fd.on{background:var(--panel);box-shadow:inset 0 0 0 2px var(--amber-bar)}
.weight .type::after{content:"";display:inline-block;width:2px;height:.9em;margin-left:2px;vertical-align:-.08em;background:var(--amber-bar);opacity:0}

.letters .h{display:none}
.letters .k{font:400 26px Newsreader,Georgia,serif;letter-spacing:0;text-transform:none;color:var(--text);margin-bottom:10px}
.letters .lt{display:grid;gap:4px}
.letters .l{display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:14px}
.letters .l>span{display:flex;align-items:center;justify-content:center;width:38px;height:26px;border-radius:99px;border:1.5px solid var(--c);color:var(--c);font-weight:700;font-size:13px}
.letters .l b{font-weight:600}.letters .l small{font-size:12.5px}
.letters .l.on{box-shadow:inset 0 0 0 1.5px var(--c)}
.letters .l.on>span{background:var(--c);color:#fff}

.lockc{padding:0}
.lock{padding:20px 16px 18px;background:linear-gradient(160deg,color-mix(in srgb,var(--indigo) 45%,var(--text)),var(--text));color:#fff}
.lock .lt9{text-align:center;font:600 64px/1 -apple-system,"SF Pro Display",Inter,system-ui,sans-serif;letter-spacing:-.02em;margin:4px 0 18px;opacity:.92}
.lock .la{padding:14px 16px;border-radius:24px;background:color-mix(in srgb,var(--panel) 94%,transparent);color:var(--text)}
.lock .top{display:flex;align-items:center;gap:12px;font-size:13px;font-weight:600;color:var(--sec)}
.lock .top span{display:inline-flex;align-items:center;gap:4px}.lock .top em{margin-left:auto;font-style:normal;font-weight:500;color:var(--muted)}
.lock .s{width:13px;height:13px}.lock .hr .i{color:var(--rust)}
.lock .mark{width:14px;height:14px;border-radius:50%;border:3px solid var(--logo-load);border-right-color:var(--logo-recovery)}
.lock .mid{display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px}
.lock .mid small{font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--amber-bar)}
.lock .count{display:block;font:400 40px/1 Newsreader,Georgia,serif;color:var(--amber-bar);font-variant-numeric:tabular-nums}
.lock .nx{text-align:right}.lock .nx small{letter-spacing:0;color:var(--muted);font-weight:500;font-size:12px}.lock .nx b{display:block;font-size:16px}.lock .nx span{font-size:14px;color:var(--sec)}
.lock .seg3{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:10px}
.lock .seg3 i{height:5px;border-radius:9px;background:color-mix(in srgb,var(--text) 14%,transparent);overflow:hidden}
.lock .seg3 i::after{content:"";display:block;width:var(--w,0);height:100%;background:var(--green)}
.lock .bt{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.lock .bt span{display:flex;align-items:center;justify-content:center;height:36px;border-radius:99px;background:color-mix(in srgb,var(--text) 12%,transparent);font-size:14px;font-weight:600}
.lock .bt .dk{background:var(--button);color:var(--on-button)}

.rate .th span{width:36px;text-align:center;font-size:18px;filter:grayscale(1);opacity:.4}
.rate .th span.on{filter:none;opacity:1}
.rate .fits{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.rate .fits div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 0;border-radius:14px;background:var(--panel2)}
.rate .fits b{font-size:13px;font-weight:600}
.rate .fits .on{background:var(--button);color:var(--on-button)}

.target .sum{display:flex;align-items:flex-end;gap:10px;margin:10px 0 6px}
.target .sum b{font:400 30px/1.1 Newsreader,Georgia,serif}.target .sum>span{font-size:20px;color:var(--muted);padding-bottom:4px}
.target .tr2 b{color:var(--green)}
.target .meals{margin-top:8px}
.target .ml{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line)}
.target .ml:last-child{border-bottom:0}.target .ml b{font-weight:600}.target .ml em{font-style:normal;color:var(--muted)}
.target .sug span{color:var(--amber);font-weight:600}

.editplus .nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
.editplus .nav span{color:var(--muted)}.editplus .nav .done{color:var(--text);font-weight:700}.editplus .nav b{font-weight:700}
.editplus .lb{margin-top:10px}
.editplus .list{border-radius:16px;background:var(--panel2);padding:0 12px}
.editplus .row{min-height:42px;font-weight:500;border-color:color-mix(in srgb,var(--text) 7%,transparent)}
.editplus .row em{margin-left:auto;font-style:normal;color:var(--muted)}
.editplus .ic{width:28px;height:28px;background:none;color:var(--amber-bar)}
.editplus .add{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;font-weight:700;line-height:1}
.editplus .go{display:none}
.editplus .new{background:color-mix(in srgb,var(--green-soft) 70%,transparent);margin:0 -12px;padding:0 12px;border-radius:0 0 16px 16px}

.coach .chat{display:grid;gap:12px}
.coach .me{justify-self:end;max-width:82%;padding:10px 14px;border-radius:20px 20px 6px 20px;background:var(--button);color:var(--on-button)}
.coach .ai p{font:400 18px/1.35 Newsreader,Georgia,serif}
.coach .wk{display:flex;align-items:center;gap:12px;margin-top:12px;padding:12px;border-radius:16px;background:var(--panel2)}
.coach .wk b{font-weight:600}
.coach .field{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding:6px 6px 6px 16px;border-radius:99px;background:var(--panel2);color:var(--muted)}
.coach .field i{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:var(--button);color:var(--on-button)}

/* On a phone the card covers the lower part of the phone, so the longer ones show less. */
@media (max-width:960px){
  .consistency .h{display:none}.consistency .k{margin-bottom:10px}
  .consistency .nights{gap:2px}.consistency .nr{height:13px}
  .letters .l small{display:none}.letters .l{padding:5px 10px}
  .editplus .row{min-height:38px}.editplus .more2{display:none}
  .target .ml:nth-child(-n+2){display:none}
  .fatigue .m:nth-child(4),.fatigue small{display:none}
  .coach .field{display:none}
  .library .pills span:nth-child(n+6){display:none}
  .rate .h{margin-bottom:6px}
}
@media (prefers-reduced-motion:no-preference){
  .js .part.on .consistency .tr b{animation:pop .45s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(.5s + var(--i) * 70ms)}
  .js .part.on .ln,.js .part.on .dialc .arc{stroke-dasharray:1;animation:draw 1.6s cubic-bezier(.4,0,.2,1) .5s both}
  .js .part.on .form .f1{animation-delay:.8s}
  .js .part.on .hrv .dot{animation:pop .4s 2s both}
  .js .part.on .dialc .sunk{animation:fade .4s 1.9s both}
  .js .part.on .alarm .sw{animation:swbg .3s both;animation-delay:calc(1s + var(--i) * .5s)}
  .js .part.on .alarm .sw::after{animation:knob .3s cubic-bezier(.3,1.3,.5,1) both;animation-delay:calc(1s + var(--i) * .5s)}
  .js .part.on .goal .pick{animation:pick 6s cubic-bezier(.6,0,.3,1) .8s both}
  .js .part.on .goal .roll span{display:block;animation:roll 6s cubic-bezier(.6,0,.3,1) .8s both}
  .js .part.on .journal .on .cb{animation:check .3s 1s both}
  .js .part.on .journal .on .ok{animation:fade .2s 1.15s both}
  .js .part.on .journal .more{animation:grow .5s cubic-bezier(.2,.8,.2,1) 1.3s both}
  .js .part.on .journal .seg .sel{animation:seg .35s 2.2s both}
  .js .part.on .library .pills .sel{animation:sel .3s 1.1s both}
  .js .part.on .library .pills .s2{animation-delay:1.8s}
  .js .part.on .library .btn{animation:press .5s 2.6s both}
  .js .part.on .fatigue .bar i{animation:bar 1s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(.6s + var(--i) * .15s)}
  .js .part.on .exercises .e{animation:slide .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(.5s + var(--i) * .2s)}
  .js .part.on .exercises .sup,.js .part.on .exercises .sl{animation:fade .4s 1.3s both}
  .js .part.on .weight .type::after{animation:caret .8s step-end 3}
  .js .part.on .letters .l.on{animation:lit .4s 1.1s both}
  .js .part.on .letters .l.on>span{animation:litp .4s 1.1s both}
  .js .part.on .lock .la{animation:up .6s cubic-bezier(.2,.8,.2,1) .4s both}
  .js .part.on .rate .th .on{animation:thumb .4s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(.9s + var(--i) * .4s)}
  .js .part.on .rate .fits .on{animation:press .5s 2s both}
  .js .part.on .target .tr2,.js .part.on .target .sum>span{animation:fade .4s .7s both}
  .js .part.on .target .sum>div:last-child b{animation:fade .4s 1.1s both}
  .js .part.on .target .ml{animation:slide .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(1.3s + var(--i) * .12s)}
  .js .part.on .editplus .go{display:flex;animation:gone 2s ease both}
  .js .part.on .editplus .go .add{animation:tap .35s .9s both}
  .js .part.on .editplus .new{animation:grow .5s cubic-bezier(.2,.8,.2,1) 1.4s both}
  .js .part.on .coach .ai{animation:slide .5s cubic-bezier(.2,.8,.2,1) 2.4s both}
  .js .part.on .coach .me{animation:fade .2s .4s both}
  @keyframes pop{from{transform:scale(0)}}
  @keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
  @keyframes fade{from{opacity:0}}
  @keyframes swbg{from{background:color-mix(in srgb,var(--text) 18%,var(--bg))}}
  @keyframes knob{from{left:3px}}
  @keyframes pick{0%,22%{left:0}30%,52%{left:calc((100% + 8px) / 3)}60%,82%{left:calc((100% + 8px) * 2 / 3)}90%,100%{left:0}}
  @keyframes roll{0%,22%{transform:translateY(0)}30%,52%{transform:translateY(-34px)}60%,82%{transform:translateY(-68px)}90%,100%{transform:translateY(-102px)}}
  @keyframes check{from{background:transparent;border-color:color-mix(in srgb,var(--text) 22%,var(--bg))}}
  @keyframes grow{from{opacity:0;transform:translateY(-8px)}}
  @keyframes seg{from{background:transparent;box-shadow:none;font-weight:400}}
  @keyframes sel{from{background:var(--panel2);color:var(--sec)}}
  @keyframes press{0%{transform:none}40%{transform:scale(.95)}100%{transform:none}}
  @keyframes bar{from{width:100%;background:var(--track)}}
  @keyframes slide{from{opacity:0;transform:translateX(-16px)}}
  @keyframes caret{50%{opacity:1}}
  @keyframes lit{from{box-shadow:none}}
  @keyframes litp{from{background:transparent;color:var(--c)}}
  @keyframes up{from{opacity:0;transform:translateY(24px)}}
  @keyframes thumb{from{filter:grayscale(1);opacity:.4;transform:scale(.6)}}
  @keyframes gone{0%,55%{max-height:42px;opacity:1}100%{max-height:0;min-height:0;opacity:0;border-width:0}}
  @keyframes tap{50%{transform:scale(.7);box-shadow:0 0 0 7px color-mix(in srgb,var(--green) 25%,transparent)}}
}
`;

// Typing and the rest's countdown: they run while their card is in view.
export const detailScript = `<script>(function(){
var still=matchMedia('(prefers-reduced-motion: reduce)').matches;if(still||!window.MutationObserver)return;
function play(part){var timers=part._t=[];
 [].forEach.call(part.querySelectorAll('[data-type]'),function(el){var text=el.dataset.type,n=0;el.textContent='';
  timers.push(setTimeout(function step(){n++;el.textContent=text.slice(0,n);if(n<text.length)timers.push(setTimeout(step,55+Math.random()*60));},500));});
 [].forEach.call(part.querySelectorAll('[data-count]'),function(el){var s=+el.dataset.count;
  var show=function(){el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};show();
  timers.push(setInterval(function(){if(s>60){s--;show();}},1000));});}
function stop(part){(part._t||[]).forEach(function(t){clearTimeout(t);clearInterval(t);});part._t=[];}
var mo=new MutationObserver(function(ms){ms.forEach(function(m){var el=m.target,on=el.classList.contains('on');if(on===!!el._on)return;el._on=on;if(on)play(el);else stop(el);});});
[].forEach.call(document.querySelectorAll('.part'),function(el){if(el.querySelector('[data-type],[data-count]'))mo.observe(el,{attributes:true,attributeFilter:['class']});});
})();</script>`;
