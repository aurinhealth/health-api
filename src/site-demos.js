// Live demos on the overview: pieces of the app rebuilt in HTML so they can move. They stand beside a chapter's
// phone in place of a still cut from the screenshot, and on three steps (strain, a finished workout, the coach)
// they are the phone's screen itself. Each one follows the app's own view (named in its comment) and the sample
// day (ios-native/Aurin/Data/DemoData.swift, in English through DemoEnglish.swift): change it when that view
// or that day changes.
//
// A demo plays a timeline when its step comes on. Elements say what happens to them and when, in ms from the
// start: data-at="600 2400:on 3000-on" adds class "in" at 600, "on" at 2400 and takes "on" off at 3000;
// data-n="from,to,start,length,format" counts a number; data-tx="1200|Building…" swaps the text; data-type=
// "start,length" types the text out. The bedtime dial also turns (data-dial) and can be dragged. With reduced
// motion a demo shows its last frame.

const CK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const P = {
  check: CK,
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.6-2.2h5.4L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  run: '<circle cx="14.5" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M7 21l3.5-6 3 2.5V22M9.5 11l2.5-3.5 4 1.5 2 3.5M12 7.5l-1 5.5 2.5 2"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9h6l3.5 7.5M9 9 12 16.5h-1M14 5.5h2.5"/>',
  lift: '<circle cx="12" cy="4.2" r="1.9" fill="currentColor" stroke="none"/><path d="M3 9h18M4.5 7v4M19.5 7v4M8 9l1.5 3.5H12h2.5L16 9M12 12.5v3.5l-3.5 5M12 16l3.5 5"/>',
  gym: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>',
  flex: '<circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 11h14M12 7.5v6.5l-4 6M12 14l4 6"/>',
  spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2L5 10.5l5.2-1.8Z" fill="currentColor" stroke="none"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" fill="currentColor" stroke="none"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
  barcode: '<path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M8 9v6M11 9v6M13.5 9v6M16 9v6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="currentColor" stroke="none"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4 3.5-5.5 4-10 3 2 5 4.5 5.5 7.5.8-.8 1.2-2 1.2-3 1.8 1.6 2.3 3.6 2.3 5.5 0 3.4-2.5 6-6.5 6Z" fill="currentColor" stroke="none"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" stroke="none"/>',
  wand: '<path d="M4 20 15 9M14 4v3M17.5 5.5l-2 2M20 9h-3M18.5 12.5l-2-2"/>',
  steps: '<path d="M7 4c2 0 3 2.2 3 5s-1 4-3 4-3-1.2-3-4 1-5 3-5ZM5 16h4M17 8c2 0 3 2.2 3 5s-1 4-3 4-3-1.2-3-4 1-5 3-5ZM15 20h4"/>',
  chup: '<path d="m6 15 6-6 6 6"/>',
  chdown: '<path d="m6 9 6 6 6-6"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8v.2"/>',
  thumb: '<path d="M7 11v9H4v-9ZM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.7 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>',
  rotate: '<path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/>',
  pencil: '<path d="M15.5 5.5l3 3M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19Z"/>',
  photo: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="m20 15-4.5-4.5L8 18"/>',
  label: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8.5 9h7M8.5 12h7M8.5 15h4.5"/>',
  updown: '<path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4"/>',
  chevd: '<path d="m6 9 6 6 6-6"/>',
  torch: '<path d="M9 3h6v4l-1.5 2v12h-3V9L9 7ZM12 12v3"/>',
  drop: '<path d="M12 3.5c3 4 6 7.3 6 10.7a6 6 0 0 1-12 0c0-3.4 3-6.7 6-10.7Z" fill="currentColor" stroke="none"/>',
  cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5ZM16 11h1.5a2.5 2.5 0 0 1 0 5H16"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M4 5l3-2M20 5l-3-2"/>',
  chat: '<path d="M4 5h11v8H8l-4 3ZM15 9h5v8l-3-2h-6v-2"/>',
  menu: '<path d="M6 8h12M6 12h12M6 16h12"/>',
};
const ic = (name, cls = '') => `<svg class="di${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>`;
const at = spec => ` data-at="${spec}"`;
const n = (from, to, start, len, fmt) => ` data-n="${from},${to},${start},${len},${fmt}"`;
// Several counts on one element go into one attribute.
const merge = html => html.replace(/ data-n="([^"]*)" data-n="/g, ' data-n="$1;').replace(/ data-n="([^"]*)" data-n="/g, ' data-n="$1;');

// The service logos (the app's own files in public/site/logos/), as the app's IntegrationIcon draws them.
const LOGO = {
  apple: '<img src="/site/logos/apple-health.png" alt="" width="15" height="15" loading="lazy">',
  google: '<img src="/site/logos/google-health.png" alt="" width="15" height="15" loading="lazy" class="pad">',
  intervals: '<img src="/site/logos/intervals.svg" alt="" width="15" height="15" loading="lazy">',
  ultrahuman: '<span class="uh-tile"><img src="/site/logos/ultrahuman.svg" alt="" width="15" height="15" loading="lazy"></span>',
  whoop: '<img src="/site/logos/whoop.svg" alt="" width="15" height="15" loading="lazy">',
  wahoo: '<span class="uh-tile word"><img src="/site/logos/wahoo.png" alt="" width="15" height="15" loading="lazy"></span>',
};
const logo = id => `<span class="lg">${LOGO[id]}</span>`;
// The Aurin mark, as the app's own source tile for what it recorded.
const AURIN = '<span class="lg au"><svg viewBox="6 10 88 80"><path d="M6 46A36 36 0 0 1 78 46Z" fill="var(--logo-load)"/><path d="M22 54A36 36 0 0 0 94 54Z" fill="var(--logo-recovery)"/></svg></span>';

// The iPhone status bar over every screen built here.
const STATUS = '<div class="sb"><span>9:41</span><span class="sbi"><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx=".7"/><rect x="5" y="5.5" width="3" height="6.5" rx=".7"/><rect x="10" y="3" width="3" height="9" rx=".7"/><rect x="15" y="0" width="3" height="12" rx=".7"/></svg><svg viewBox="0 0 24 12"><rect x=".5" y=".5" width="20" height="11" rx="3" fill="none" stroke="currentColor"/><rect x="2" y="2" width="16" height="8" rx="1.8"/><rect x="22" y="4" width="1.5" height="4" rx=".7"/></svg></span></div>';

// ---- Sleep (SleepPlanner.swift, HealthDetails.swift) ----
// The night: stages in the app's indigo shades, the stages through the night one row each (Hypnogram), the
// length counting up. NIGHT is the sample night's segments (DemoData.night): stage, start, end in minutes.
const NIGHT = [['l', 0, 12], ['d', 12, 40], ['l', 40, 62], ['r', 62, 74], ['a', 74, 77], ['l', 77, 100], ['d', 100, 130],
  ['l', 130, 158], ['r', 158, 178], ['l', 178, 210], ['d', 210, 228], ['l', 228, 262], ['r', 262, 284], ['a', 284, 290],
  ['l', 290, 330], ['d', 330, 337], ['l', 337, 370], ['r', 370, 400], ['a', 400, 405], ['l', 405, 436], ['r', 436, 446], ['a', 446, 449]];
const sleepNight = `<div class="dm pad">
<div class="sl">Sleep · Wednesday night</div>
<div class="row base"><span class="num big"${n(400, 432, 150, 1300, 'hmc')}>7:12</span><span class="pill ind"${at('1300')}>Score 82</span></div>
<div class="hg" aria-hidden="true"><div class="hgl"><span>Awake</span><span>REM</span><span>Light</span><span>Deep</span></div><div class="hgt">${NIGHT.map(([t, s, e], i) => `<i class="${t}" style="left:${(s / 449 * 100).toFixed(2)}%;width:${Math.max(0.5, (e - s) / 449 * 100).toFixed(2)}%"${at(String(300 + i * 60))}></i>`).join('')}</div></div>
<div class="hgx" aria-hidden="true"><span>11:33 PM</span><span>7:02 AM</span></div>
<div class="stg">${[['Deep', '1:23', 83, '19%', 'd'], ['REM', '1:34', 94, '22%', 'r'], ['Light', '4:15', 255, '59%', 'l'], ['Awake', '0:17', 17, '3×', 'a']].map(([k, v, m, p, c], i) => `<div class="sr"><span>${k}</span><i class="bar"><b class="${c}" style="--w:${(m / 255 * 100).toFixed(1)}%"${at(String(900 + i * 220))}></b></i><span class="num">${v}</span><span class="mut">${p}</span></div>`).join('')}</div>
</div>`;

// "Why 8 h 30 min": the need for tonight built up row by row.
const sleepNeed = `<div class="dm pad">
<div class="sl">Need and debt</div>
<div class="nd"><div class="row sp base"><b class="nt">Need for tonight</b><span class="num md"${n(480, 510, 600, 2600, 'hmc')}>8:30</span></div>
<div class="nr"${at('100')}><span>Baseline for your age</span><span class="mono">8:00</span></div>
<div class="nr"${at('900')}><span>Today’s strain</span><span class="mono">+ 0:15</span></div>
<div class="nr"${at('1700')}><span>Paying back debt</span><span class="mono">+ 0:30</span></div>
<div class="nr"${at('2500')}><span>Naps</span><span class="mono">− 0:15</span></div>
<div class="row sp base ndd"${at('3300')}><b class="nt">Sleep debt over 7 days</b><span class="num md amb">4:51</span></div>
<i class="kbar"><b style="--w:82%"${at('3300')}></b></i></div>
</div>`;

// The bedtime dial: 24 h, midnight on top, the night arc in indigo from the moon to the sun. It turns on its
// own, and you can drag the sun (wake) or the moon (bedtime) in 5-minute steps, as in the app.
const dial = `<div class="dm pad dialbox">
<div class="dial" data-dial="0:390:510 1400:390:510 3000:435:510 4200:435:510 5600:435:450 6800:435:450 8000:435:510" data-wake="435" data-sleep="510">
<svg viewBox="0 0 300 300" aria-hidden="true"><circle class="trk" cx="150" cy="150" r="126"/><path class="arc" d=""/>
${[0, 3, 6, 9, 12, 15, 18, 21].map(h => { const a = h / 24 * 2 * Math.PI; return `<text x="${(150 + 98 * Math.sin(a)).toFixed(1)}" y="${(150 - 98 * Math.cos(a) + 4).toFixed(1)}">${h}</text>`; }).join('')}
<circle class="usual" cx="${(150 + 143 * Math.sin(1428 / 1440 * 2 * Math.PI)).toFixed(1)}" cy="${(150 - 143 * Math.cos(1428 / 1440 * 2 * Math.PI)).toFixed(1)}" r="3"/></svg>
<div class="ctr" aria-hidden="true"><span class="num len">8:30</span><span class="mut s">sleep</span></div>
<button type="button" class="hd moon" role="slider" aria-label="Bedtime" aria-valuemin="0" aria-valuemax="1435">${ic('moon')}</button><button type="button" class="hd sun" role="slider" aria-label="Wake up" aria-valuemin="0" aria-valuemax="1435">${ic('sun')}</button>
</div>
<div class="tiles" aria-hidden="true"><div class="tile"><div class="th ind">${ic('moon')}Bedtime</div><span class="num bed">10:10 PM</span></div><div class="tile"><div class="th amb">${ic('sun')}Wake up</div><span class="num wake">7:15 AM</span></div></div>
<p class="hint" aria-hidden="true">Drag the moon or the sun</p>
</div>`;

// "Tonight I want": the pick moves, and the bedtime follows it.
const tonight = `<div class="dm pad">
<div class="sl">Tonight I want</div>
<div class="chips3">
<div class="ch3 on"${at('2600-on 7400:on')}><b>Catch up</b><span class="mono">8 h 30 min</span></div>
<div class="ch3"${at('2600:on 5000-on')}><b>As usual</b><span class="mono">8 h</span></div>
<div class="ch3"${at('5000:on 7400-on')}><b>At least</b><span class="mono">7 h</span></div>
</div>
<div class="tiles"><div class="tile"><div class="th ind">${ic('moon')}Bedtime</div><span class="num" data-tx="0|10:10 PM;2700|10:40 PM;5100|11:45 PM;7500|10:10 PM">10:10 PM</span></div><div class="tile"><div class="th amb">${ic('sun')}Wake up</div><span class="num">7:15 AM</span></div></div>
</div>`;

// ---- Readiness (HealthView.swift: what makes up today's score; JournalImpact.swift) ----
const range = (pos, color, start) => `<i class="rb"><b></b><u style="--x:${pos}%;--c:var(--${color})"${at(String(start))}></u></i>`;
const HIST = [65, 69, 60, 82, 67, 71, 62, 53, 75, 80, 63, 54, 77, 78];
const readyParts = `<div class="dm pad">
<div class="sl">Readiness</div>
<div class="row base"><span class="num big"${n(0, 78, 200, 1300, 'i')}>78</span><span class="pill grn"${at('1300')}>high</span></div>
<div class="sl">What makes up today’s score</div>
${[['Sleep', '7:12', 'your normal 7:20–8:10', 'worse than usual', 'rust', 12, '−4 readiness points'], ['Resting heart rate', '48 bpm', 'your normal 50–54 bpm', 'better than usual', 'green', 20, '+3 readiness points'], ['HRV', '64 ms', 'your normal 55–61 ms', 'better than usual', 'green', 83, '+9 readiness points']]
    .map(([k, v, nm, dir, c, x, pt], i) => `<div class="pr3"><div class="row sp base"><b>${k}</b><span class="num md">${v}</span></div><div class="row sp"><span class="mut s">${nm}</span><span class="s" style="color:var(--${c})">${dir}</span></div>${range(x, c, 500 + i * 250)}<span class="pts" style="color:var(--${c === 'rust' ? 'rust-ink' : c})">${pt}</span></div>`).join('')}
</div>`;

const journal = `<div class="dm pad">
<div class="sl">Yesterday</div>
<div class="jt">${[['Sauna', 'flame', 600], ['Late meal', 'run', -1], ['Alcohol', 'x', 1100], ['Outdoors 30+ min', 'sun', 1600]].map(([k, icn, t]) => `<span class="jc${t > 0 ? '' : ' no'}"${t > 0 ? at(String(t)) : ''}><i>${ic(t > 0 ? 'check' : 'x')}</i>${k}</span>`).join('')}</div>
<div class="sent jh">What affects you</div>
<div class="row sp s"><b style="color:var(--rust)">Hurts</b><span class="mut">readiness the next morning</span><b style="color:var(--green)">Helps</b></div>
<div class="imp">${[['Alcohol', -17], ['Late meal', -9], ['Phone in bed', -5], ['Outdoors 30+ min', 4], ['Magnesium', 6], ['Sauna', 11]].map(([k, v], i) => `<div class="ir"><span class="nm${v < 0 ? ' r' : ''}">${k}</span><i class="iv${v < 0 ? ' neg' : ''}" style="--w:${Math.abs(v) / 22 * 50}%"${at(String(2200 + i * 260))}><b class="num">${v < 0 ? '−' : '+'}${Math.abs(v)} %</b></i></div>`).join('')}</div>
</div>`;

// ---- Strain (StrainDetailView.swift) ----
// The gauge: a 270° arc, the target band in green, the score in amber, no needle.
const gauge = (size, start) => {
  const r = size / 2 - 10, c = 2 * Math.PI * r, arc = c * .75, f = x => (x / 21 * arc).toFixed(1);
  return `<svg class="gauge" viewBox="0 0 ${size} ${size}" style="width:${size}px" aria-hidden="true"><g transform="rotate(135 ${size / 2} ${size / 2})">
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="gt" stroke-dasharray="${arc.toFixed(1)} ${c.toFixed(1)}"/>
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="gb" stroke-dasharray="${f(3)} ${c.toFixed(1)}" stroke-dashoffset="-${f(11.4)}"/>
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="gs" style="--d:${f(8.4)}px;--c:${c.toFixed(1)}px" stroke-dasharray="${f(8.4)} ${c.toFixed(1)}"${at(String(start))}/></g></svg>`;
};
const strainScreen = `<div class="app glow-training">${STATUS}
<div class="nav c"><span class="cb">${ic('chev', 'flip')}</span><span class="pill grn">${ic('spark')}Coach</span></div>
<div class="sl">Training · today</div>
<div class="sent title">Strain</div>
<div class="gwrap">${gauge(190, 300)}<div class="gc"><span class="num g"${n(0, 8.4, 300, 1600, '1')}>8.4</span><span class="mut s">target 11–14 · of 21</span></div><div class="gl"><span>0</span><span>21</span></div></div>
<div class="center"><span class="pill amb"${at('1700')}>moderate</span></div>
<div class="card split"><i class="sb2"><b class="w" style="--w:${5.1 / 21 * 100}%"${at('500')}></b><b class="m" style="--w:${3.3 / 21 * 100}%"${at('1200')}></b><b class="p" style="--w:${5.0 / 21 * 100}%"${at('2000')}></b></i>
<div class="leg"><b>5.1</b> workout <b>3.3</b> movement <b>+5.0</b> in plan</div></div>
<div class="sl pad2">Today’s target</div>
<div class="card rows"><div class="li"><span>Readiness</span><span>78</span></div><div class="li"><span>Sleep debt</span><span>4 h 51 min</span></div><div class="li"><span>Plan</span><span>Strength, full body</span></div></div>
<div class="sl pad2">What it’s made of</div>
<div class="card made"><div class="mi"><span class="sq amb">${ic('run')}</span><div><b>Morning run</b><span class="mut s">7:30 AM · 42 min · 48 TSS</span></div><span class="num">5.1</span></div><div class="mi"><span class="sq sand">${ic('steps')}</span><div><b>Movement through the day</b><span class="mut s">6,420 steps</span></div><span class="num">3.3</span></div></div>
</div>`;

// Beside the phone: what adds up to today's strain, and where it should land.
const strainMade = `<div class="dm pad">
<div class="row sp"><div class="sl">What it’s made of</div><span class="mut s">target 11–14</span></div>
<div class="tgt"><i><b class="band"></b><b class="fill"${at('400:a 1700:b 3000:c')}></b></i><span class="num"${n(0, 5.1, 400, 900, '1')}${n(5.1, 8.4, 1700, 900, '1')}${n(8.4, 13.4, 3000, 900, '1')}>13.4</span></div>
<div class="mi"${at('400')}><span class="sq amb">${ic('run')}</span><div><b>Morning run</b><span class="mut s">7:30 AM · 42 min · 48 TSS</span></div><span class="num">5.1</span></div>
<div class="mi"${at('1700')}><span class="sq sand">${ic('steps')}</span><div><b>Movement through the day</b><span class="mut s"><span${n(0, 6420, 1700, 1100, 'i')}>6,420</span> steps</span></div><span class="num">3.3</span></div>
<div class="mi plan"${at('3000')}><span class="sq dash">${ic('gym')}</span><div><b>Strength, full body</b><span class="mut s">5:30 PM · in plan</span></div><span class="num faint">+5.0</span></div>
<p class="note"${at('4000')}>Lands inside today’s target.</p>
</div>`;

// ---- Training week (TrainingCalendar.swift, PlanSessionActions.swift) ----
// The day strip: green on plan, amber done differently, dashed grey upcoming; the percent of the plan
// shows in the day's list. Thursday's planned gym session turns done, its source and percent appear, and
// the month opens under the handle.
const pct = (p, attrs = '') => `<span class="pc ${p >= 85 && p <= 115 ? 'ok' : 'off'}"${attrs}>${p} %</span>`;
const dayC = (d, num, sport, state) => `<div class="dc"><span class="wd">${d}</span><span class="ci ${state}">${ic(sport)}</span><span class="num dn">${num}</span></div>`;
const MONTH = [['', '', '', 1, 2, 3, 4], [5, 6, 7, 8, 9, 10, 11], [12, 13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24, 25], [26, 27, 28, 29, 30, 31, '']];
const monthState = d => d === '' ? '' : d > 8 ? (d % 7 === 2 ? '' : 'up') : d === 4 ? 'off' : d === 7 ? 'off' : d % 11 === 0 ? '' : d === 3 || d === 8 ? 'ok' : (d % 7 === 5 ? 'out' : 'ok');
const monthSport = d => ['gym', 'bike', 'run', 'gym', 'bike', 'bike', 'run'][d % 7];
const week = `<div class="dm pad wk">
<div class="sl">Training · Week 41</div>
<div class="strip">${dayC('Mo', 5, 'run', 'ok')}${dayC('Tu', 6, 'bike', 'ok')}${dayC('We', 7, 'bike', 'off')}<div class="dc sel"><span class="wd today">Th</span><span class="ci up"${at('1400:done')}>${ic('gym')}</span><span class="num dn">8</span></div>${dayC('Fr', 9, 'bike', 'up')}${dayC('Sa', 10, 'run', 'up')}</div>
<div class="handle"${at('4300:pull 5200-pull')}><i></i><span data-tx="0|Full month;4800|Less">Full month</span></div>
<div class="month"${at('4800:open')}><div class="mh"><b>October</b><span class="mut s">12 activities · 14 h 20 min</span></div><div class="mg">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span class="mw">${d}</span>`).join('')}${MONTH.flat().map((d, i) => `<span class="md${d === 8 ? ' sel' : ''}" style="--i:${i}"><span>${d}</span>${monthState(d) ? `<span class="ci ${monthState(d)}">${ic(monthSport(d))}</span>` : ''}</span>`).join('')}</div></div>
<div class="day"><div class="row sp"><b>Today</b><span class="mut s">1 h 27 min · 840 kcal</span></div>
<div class="ar"><span class="ci ok">${ic('run')}</span><div><b>Morning run</b><span class="src">${logo('apple')}Apple Health</span><span class="mut s">Run · 7:30 AM · 42 min · 8.2 km</span>${pct(98)}</div><span class="num">520<small>kcal</small></span></div>
<div class="ar"><span class="ci up"${at('1400:done')}>${ic('gym')}</span><div><b>Strength, full body</b><span class="src"${at('2200')}>${AURIN}Aurin, Apple Watch</span><span class="mut s" data-tx="0|Planned · 5:30 PM · 45 min;1400|Strength · 5:30 PM · 47 min">Planned · 5:30 PM · 45 min</span>${pct(94, at('2200'))}</div><span class="num"${at('2200')}>320<small>kcal</small></span></div>
</div></div>`;

// ---- Gym (GymTools.swift GymBuilderView, GymDayParts.swift GymPartsCard) ----
const seg = (opts, from, to, t) => `<div class="seg">${opts.map((o, i) => `<span${i === from ? ' class="on"' : ''}${i === from && to !== from ? at(`${t}-on`) : ''}${i === to && to !== from ? at(`${t}:on`) : ''}>${o}</span>`).join('')}</div>`;
const EX = [['Bench press', 'Chest · Triceps', '3 × 8–10 · 62.5 kg', 'A'], ['Bent-over rows', 'Back · Biceps', '3 × 10 · 50 kg', 'A'], ['Overhead press', 'Shoulders · Triceps', '3 × 8 · 37.5 kg'], ['Lat pulldown', 'Back · Biceps', '3 × 10–12 · 55 kg'], ['Biceps curls', 'Biceps', '2 × 12 · 12 kg']];
const builder = `<div class="dm pad bld">
<div class="stage1"${at('3900:gone')}>
<div class="sl">When and how long</div>${seg(['30', '45', '60', '75', '90', '120'], 2, 2, 0)}
<div class="sl">Focus</div>${seg(['Full body', 'Upper', 'Legs', 'Muscles'], 0, 1, 900)}
<div class="eq"><span class="ib ind">${ic('gym')}</span><div><b>Equipment</b><span class="mut s">Gym · 14 machines</span></div>${ic('chev')}</div>
<div class="btn"${at('2000:press 2300-press 2300:busy')}><span class="sp1"></span>${ic('spark')}<span data-tx="0|Suggest a workout;2300|Building…">Suggest a workout</span></div>
</div>
<div class="stage2"${at('3900:in')}>
<div class="sent h">Upper body</div><span class="mut s">Today · 60 min</span>
<div class="sl">Exercises</div>
<div class="ss">${EX.map(([nm, mu, sets, ss], i) => `<div class="ex${ss ? ' sup' : ''}"${at(String(4200 + i * 260))}><span class="num ix">${i + 1}</span><div><b>${nm}</b><span class="mut s">${mu}</span></div><span class="s sec">${sets}</span></div>`).join('')}</div>
<div class="btn dark"${at('5900')}>${ic('check')}Save to plan</div>
</div></div>`;

// Upravit pořadí (GymDayParts.swift GymPartsCard) swaps the switches for arrows that move a part up or down.
const part = (id, icon, color, title, sub, toggle) => `<div class="pt ${id}"><span class="ib ${color}">${ic(icon)}</span><div><b>${title}</b><span class="mut s">${sub}</span></div><span class="gpr">${toggle === null ? '' : `<span class="tg${toggle ? ' on' : ''}"${toggle === 'flip' ? at('1200:on') : ''}><i></i></span>`}<span class="gar"><i>${ic('chup')}</i><i>${ic('chdown')}</i></span></span></div>`;
const gymParts = `<div class="dm pad">
<div class="row sp"><b class="sent md2"><span${n(58, 68, 1200, 700, 'i')}>68</span> min in total</b><span class="mut s"><span${n(13, 23, 1200, 700, 'i')}>23</span> min extra</span></div>
<div class="tbar"><i class="w" style="flex:5"></i><i class="c"${at('1200:on')}></i><i class="l" style="flex:45"></i><i class="sx" style="flex:8"></i></div>
<div class="tl s mut">Warm-up 5 · <span class="tc"${at('1200:on')}>Cardio 10 · </span>Lifting 45 · Stretching 8 min</div>
<div class="row sp"><span class="sl">Today’s workout</span><span class="s gro" data-tx="0|Reorder;2600|Done;4600|Reorder">Reorder</span></div>
<div class="gparts"${at('2600:reo 3500:swap 4600-reo')}>
${part('p1', 'run', 'amb', 'Warm-up', 'Automatic · 5 min', true)}
${part('p2', 'bike', 'rust', 'Cardio', 'Exercise bike · 10 min', 'flip')}
${part('p3', 'gym', 'amb2', 'Exercises', '5 exercises · 45 min', null)}
${part('p4', 'flex', 'ind', 'Stretching', 'Automatic · 8 min', true)}
</div>
</div>`;

// ---- Training mode (TrainingModeView.swift, TrainingModeParts.swift GymSetRow, GymIntensity.swift) ----
const setRow = (label, last, kg, reps, letter, state, attrs = '') => `<div class="st ${state}"${attrs}><span class="sl2">${label}</span><span class="mut s">${last}</span><span class="v num">${kg}</span><span class="v num">${reps}</span><span class="lt">${letter}</span><span class="tk">${ic('check')}</span></div>`;
const tmTable = `<div class="dm pad tm">
<div class="sent h">Squat</div>
<div class="th2"><span>Sets</span><span>Last time</span><span>kg</span><span>Reps</span><span></span><span></span></div>
${setRow('W', '40 × 8', '40', '8', '<i class="ip w">W</i>', 'done')}
${setRow('1', '77.5 × 8', '80', '8', '<i class="ip m">M</i>', 'done')}
<div class="st cur"><span class="sl2">2</span><span class="mut s">77.5 × 8</span><span class="v num ed"><span data-tx="0|80;1100|82.5">80</span></span><span class="v num ed"><span data-tx="0|8;1900|6">8</span></span><span class="lt"><i class="ip dash" data-tx="0|H;2700|F">H</i></span><span class="tk"></span></div>
${setRow('3', '77.5 × 8', '80', '6–8', '<i class="ip dash">H</i>', 'next')}
<div class="st next add"${at('3500')}><span class="sl2">4</span><span class="mut s">—</span><span class="v num">80</span><span class="v num">6–8</span><span class="lt"><i class="ip none"></i></span><span class="tk"></span></div>
<div class="row gap"><span class="pb"${at('3300:press 3600-press')}>${ic('plus')}Sets</span><span class="pb">${ic('minus')}Sets</span><span class="pb">Plates: 20 + 10 per side</span></div>
</div>`;

const LETTERS = [['W', 'Warm-up', 'muted'], ['T', 'Technique', 'blue'], ['E', 'Easy', 'green'], ['M', 'Moderate', 'indigo'], ['H', 'High', 'amber'], ['F', 'Failure', 'red'], ['PR', 'Personal record', 'gold'], ['D', 'Drop set', 'pink']];
const tmTick = `<div class="dm pad tm">
<div class="row sp"><div class="sent h">Squat</div><span class="tag rust">${ic('flame')}To failure</span></div>
${setRow('1', '77.5 × 8', '80', '8', '<i class="ip m">M</i>', 'done')}
<div class="st cur"${at('3600-cur 3600:done')}><span class="sl2">2</span><span class="mut s">77.5 × 8</span><span class="v num">82.5</span><span class="v num">6</span><span class="lt"><i class="ip dash"${at('2300:f')} data-tx="0|H;2300|F">H</i></span><span class="tk"></span></div>
<div class="st next"${at('3800-next 3800:cur')}><span class="sl2">3</span><span class="mut s">77.5 × 8</span><span class="v num">80</span><span class="v num">6–8</span><span class="lt"><i class="ip dash">H</i></span><span class="tk"></span></div>
<div class="lpick"${at('700:in 2600-in')}>${LETTERS.map(([l, name, c]) => `<span class="lr"${l === 'F' ? at('1700:on') : ''}><i class="ip" style="--c:var(--${c})">${l}</i>${name}</span>`).join('')}</div>
<div class="btn dark"${at('3300:press 3600-press')}>${ic('check')}Set done</div>
</div>`;

// The rest ring counts down for real; +15 s adds to it, as the buttons under the app's ring do.
const RING = 2 * Math.PI * 84;
const tmRest = `<div class="dm pad tm rest">
<div class="ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="84" class="rt"/><circle cx="100" cy="100" r="84" class="ra" stroke-dasharray="${RING.toFixed(1)}" data-ring="90,82,0,8000,90;97,92,8200,5000,105" style="stroke-dashoffset:0"/></svg>
<div class="rc"><span class="mut s">Rest</span><span class="num rtm"${n(90, 82, 0, 8000, 'ms')}${n(97, 92, 8200, 5000, 'ms')}>1:30</span><span class="mut s" data-tx="0|of 1:30;8000|of 1:45">of 1:30</span></div></div>
<div class="row gap c3"><span class="pb2">−15 s</span><span class="pb2"${at('7700:press 8000-press')}>+15 s</span><span class="pb2">Skip</span></div>
<div class="nowc"><span class="mut s">Now</span><div class="row sp"><b>Squat · set 3</b><span class="num md">80 kg × 8</span></div><span class="mut s">Last time 77.5 × 8</span></div>
</div>`;

// The finish screen (TrainingModeView.swift summary): what you did, a record, the changes, the muscles it tired, saved to Health.
const doneScreen = `<div class="app glow-training">${STATUS}
<div class="nav"><span class="cb">${ic('x')}</span><div class="nt"><b>Full body</b><span class="mut s">3 exercises · 9/9 sets</span></div></div>
<div class="center col"><div class="sl">Workout done</div><div class="sent title2">Full body</div></div>
<div class="grid3">${[['Time', '47 min', 0, 47, 'min'], ['Calories', '412 kcal', 0, 412, 'kcal'], ['Avg HR', '128 bpm', 0, 128, 'bpm'], ['Sets', '9', 0, 9, ''], ['Volume', '4.2 t', 0, 4.2, 't', '+0.6 t'], ['Max HR', '164 bpm', 0, 164, 'bpm']]
    .map(([k, v, f, t, u, d], i) => `<div><span class="mut s">${k}</span><span class="num tv"><span${n(f, t, 300 + i * 120, 1100, u === 't' ? '1' : 'i')}>${String(t)}</span>${u ? ' ' + u : ''}</span>${d ? `<span class="grn s"${at('1600')}>${d}</span>` : ''}</div>`).join('')}</div>
<div class="card rec"${at('1900')}><span class="sc amb">${ic('spark')}</span><div><b>New record</b><span class="mut s">Squat 82.5 × 6</span></div></div>
<div class="card chg"${at('2500')}>${[['Squat', '3 × 80 kg', '+2.5 kg', 'grn'], ['Bench press', '2 × 62.5 kg', '+1 reps', 'grn'], ['Bent-over rows', '2 × 50 kg', '=', 'mut']].map(([a, b, c, k]) => `<div class="li"><div><b>${a}</b><span class="mut s">${b}</span></div><span class="${k} s b">${c}</span></div>`).join('')}</div>
<div class="card mf"${at('2800')}><img src="/site/muscles/f00.webp" alt="" width="34" height="53" loading="lazy"><div><b>Muscle fatigue</b><span class="mut s">Quads and glutes rested in 2 days</span></div><span class="mut">${ic('chev')}</span></div>
<div class="card hk"${at('3400')}><span class="rust">${ic('heart')}</span><b>Saved to Apple Health</b><span class="grn">${ic('check')}</span></div>
<div class="btn dark big2">${ic('thumb')}Rate</div>
</div>`;

const tmDone = `<div class="dm pad">
<div class="sent h2">How was the workout?</div>
<div class="sl">Exercises</div>
${[['Squat', 1], ['Bench press', 1], ['Bent-over rows', 0]].map(([k, up], i) => `<div class="li"><span>${k}</span><span class="thumbs"><i class="tu${up ? '' : ''}"${up ? at(String(900 + i * 500) + ':on') : ''}>${ic('thumb')}</i><i class="td">${ic('thumb', 'down')}</i></span></div>`).join('')}
<div class="sl">Did the workout’s plan suit you?</div>
<div class="suit"><span${at('2600:on')}>👍<b>Suited me</b></span><span>😐<b>It’s OK</b></span><span>👎<b>Didn’t suit me</b></span></div>
</div>`;

// ---- Food (Widgets.swift FoodWidget, FoodView.swift, BarcodeScanSheet.swift, PortionWheel chips) ----
const foodTarget = `<div class="dm pad">
<div class="row base"><span class="num big">1,380</span><span class="fo mut">of <span${n(2300, 2650, 1500, 1100, 'i')}>2,650</span><br>kcal</span></div>
<div class="coach"><div class="ch4">${ic('spark')}Coach</div><p class="sent">Training day: 350 kcal more. 1,270 kcal left, an afternoon snack of about 360 kcal.</p></div>
<div class="mac3">${[['Carbs', 177, 330, 'carbs'], ['Protein', 84, 150, 'protein'], ['Fat', 36, 80, 'fat']].map(([k, v, t, c]) => `<div><span class="mut s"><i style="background:var(--${c})"></i>${k}</span><span class="num md">${v}<small> / ${t} g</small></span><i class="mb"><b style="--w:${v / t * 100}%;background:var(--${c})"></b></i></div>`).join('')}</div>
<div class="mut s alln">All nutrients ›</div>
</div>`;

// AddFoodSheet.swift ("Co přidáme?": the meal, the search, six tiles, the foods list), then BarcodeScanSheet.swift:
// the finder with "Vybrat fotku", the found card with NutritionCells, the PortionWheel turned to 1½ servings, and "Přidat do oběda".
const foodAdd = `<div class="dm pad fa">
<div class="row sp"><span class="sent h">What are you adding?</span><span class="mut s">Close</span></div>
<span class="meal">Lunch${ic('updown')}</span>
<div class="srch">${ic('search')}<span class="mut">Search foods</span></div>
<div class="tiles6">${[['barcode', 'Scan'], ['camera', 'Photo'], ['photo', 'From library'], ['label', 'Label'], ['pencil', 'Manual'], ['spark', 'AI lookup']].map(([i, t], k) => `<span${k ? '' : at('500:press 900-press')}>${ic(i)}${t}</span>`).join('')}</div>
<div class="seg2"><span class="on">Foods</span><span>Recipes</span></div>
${[['Plain Greek yogurt', 'Hollandia · 140 g', 205], ['Banana', '120 g', 105]].map(([k, d, v]) => `<div class="li"><div><b>${k}</b><span class="mut s">${d}</span></div><span class="num">${v}<small>kcal</small></span></div>`).join('')}
<div class="scn"${at('900:in')}>
<div class="row sp"><span class="cb">${ic('x')}</span><span class="sl0">BARCODE</span><span class="cb">${ic('torch')}</span></div>
<div class="finder"${at('900:in 2900-in')}><div class="cam"><div class="bc"></div><i class="scan"></i><span class="cr tl"></span><span class="cr tr"></span><span class="cr bl"></span><span class="cr br"></span></div><p class="sent aim">Point at the barcode on the package</p><span class="olp pk">${ic('photo')}Choose photo</span></div>
<div class="res"${at('2900:in')}>
<div class="row sp"><span class="grn s b">✓ Found</span><span class="olp">${ic('pencil')}Edit product</span></div>
<div class="sent h3">Plain Greek yogurt</div>
<div class="mut s">Hollandia · EAN 8594001234567</div>
<div class="nc">${[['kcal', 205, 307], ['protein', 13, 19.5], ['carbs', 6, 9], ['fat', 14, 21]].map(([k, a, b]) => `<div><span class="num md"${n(a, b, 4500, 700, 'i')}>${Math.round(b)}</span><span class="mut s">${k === 'kcal' ? 'kcal' : k + ' g'}</span></div>`).join('')}</div>
<div class="wf"><b data-tx="0|1;4500|1½">1½</b><i></i><span>serving (140 g)</span>${ic('chevd')}</div>
<div class="wheel"><div class="col w"><ul>${['0', '1', '2'].map(x => `<li>${x}</li>`).join('')}</ul></div><div class="col p"><ul${at('4500:on')}>${['', '–', '¼', '⅓', '½', '⅔'].map(x => `<li>${x}</li>`).join('')}</ul></div><div class="col u"><ul>${['g', 'serving (140 g)', ''].map(x => `<li>${x}</li>`).join('')}</ul></div></div>
<div class="mut s">1 serving = 140 g · 205 kcal</div>
<span class="meal">Lunch${ic('updown')}</span>
<div class="btn dark"${at('5800:press 6100-press 6100:ok')}><span data-tx="0|Add to lunch · 1 serving;4500|Add to lunch · 1½ serving;6100|✓ Added to lunch">Add to lunch · 1½ serving</span></div>
</div></div></div>`;

// FoodView.swift's drinks card (DrinkFigure.swift's whale, DrinkPresetRow in DrinkFavorites.swift) on the sample
// day's 1.5 of 2.6 L: Water 500 ml twice (the chip ticks), then a tap on the whale adds the first favourite, the
// toast says so, and at the goal the whale jumps, closes its eye happily and blows its spout.
const WHALE_TAIL = 'M80 58C92 52 96 40 104 30C106 40 104 48 100 52C106 54 108 62 106 70C98 64 92 64 84 70';
const DROP = 'M0-5C2.5-1.5 3.5.5 3.5 2A3.5 3.5 0 0 1-3.5 2C-3.5.5-2.5-1.5 0-5Z';
const whaleFig = `<svg class="dw" viewBox="0 0 110 110" aria-hidden="true"${at('4300:press 4450-press 5500:goal')}><defs><clipPath id="dwc"><ellipse cx="50" cy="62" rx="38" ry="28"/><path d="${WHALE_TAIL}Z"/></clipPath></defs>
<g clip-path="url(#dwc)"><rect x="-10" y="-10" width="130" height="130" class="dw-empty"/><g class="dw-w"${at('900:a 2700:b 4800:c')}><path class="w-wv dw-f1" d="M0 0 q13.75 -3.25 27.5 0 t27.5 0 q13.75 -3.25 27.5 0 t27.5 0 q13.75 -3.25 27.5 0 t27.5 0 q13.75 -3.25 27.5 0 t27.5 0 V90 H0Z"/><path class="w-wv w-wv2 dw-f2" d="M0 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 V90 H0Z" transform="translate(0 6)"/></g>
<ellipse class="dw-ring"${at('4800 5600-in')} cx="48" cy="31" rx="7" ry="2.4"/></g>
<g class="dw-ink"><ellipse cx="50" cy="62" rx="38" ry="28"/><path d="${WHALE_TAIL}"/></g>
<g class="dw-eye"><circle cx="30" cy="56" r="3.6" class="dw-face"/><circle cx="31.2" cy="54.8" r="1.1" fill="#fff"/><path d="M22 70Q32 76 42 70" class="dw-ink dw-thin"/></g>
<g class="dw-happy"><path d="M26 57Q30 51.5 34 57" class="dw-lid"/><ellipse cx="24" cy="66" rx="4" ry="2.4" class="dw-blush"/><path d="M21 69Q32 79 43 69" class="dw-ink dw-thin"/></g>
<path class="dw-drop"${at('4350')} d="${DROP}" transform="translate(48 0) scale(1.5)"/>
<g class="dw-spout"${at('5500')}><path d="M48 32C46 20 40 14 34 16M48 32C50 18 56 12 62 14M48 32V12"/><circle cx="32" cy="12" r="2.5"/><circle cx="64" cy="10" r="2.5"/><circle cx="48" cy="6" r="2.5"/></g>
<g class="dw-burst"${at('5500')}>${[[-34, -22], [34, -26], [-20, -34], [20, -36], [-44, -8], [44, -10]].map(([x, y], i) => `<path d="${DROP}" style="--x:${x}px;--y:${y}px;--d:${i * 60}ms"/>`).join('')}</g></svg>`;
const drinkChip = (icon, kind, ml, when, taps) => `<span class="dk-chip"${when ? at(when) : ''}><span class="dk-ic">${ic(icon)}${ic('check', 'dk-ok')}</span><span><span class="mut">${kind}</span><b>${ml} ml</b></span>${taps ? `<i class="w-tap"${at(taps)}></i>` : ''}</span>`;
const drinks = `<div class="dm pad dk">
<div class="row sp"><span class="row dk-h"><i class="dk-dot"></i>Drinks &amp; hydration</span><span class="dk-plus">${ic('plus')}</span></div>
<div class="row dk-r"><span class="dk-fig">${whaleFig}<i class="w-tap"${at('4200 4600-in')}></i></span><div>
<div class="row base dk-amt"><span class="num big" data-n="1.5,2,900,700,1;2,2.5,2700,700,1;2.5,2.75,4800,900,1">2.8</span><span class="num dk-of">/ 2.6 L</span></div>
<div class="dk-pc"><span data-n="58,77,900,700,i;77,96,2700,700,i;96,106,4800,900,i">106</span>%</div>
<div class="mut s" data-tx="0|1.1 L to go;1300|0.6 L to go;3100|0.1 L to go;5500|goal reached">goal reached</div>
<div class="mut s" data-tx="0|drank 1.6 L;1300|drank 2.1 L;3100|drank 2.6 L;5000|drank 2.9 L">drank 2.9 L</div></div></div>
<div class="dk-toast"${at('4700')}><span class="dk-t">${ic('check')}Added: water, 250 ml</span><b>Undo</b></div>
<div class="dk-chips">${drinkChip('drop', 'Water', 250)}${drinkChip('drop', 'Water', 500, '600:press 750-press 900:ok 2100-ok 2400:press 2550-press 2700:ok 3900-ok', '500 900-in 2300 2700-in')}${drinkChip('cup', 'Coffee', 200)}</div>
</div>`;

// ---- Coach (CoachView.swift: bubbles, ActionCard with a workout preview, the confirmed line) ----
const coachScreen = `<div class="app glow-today chat">${STATUS}
<div class="nav c"><span class="cb">${ic('x')}</span><b>Coach</b><span class="cb">⋯</span></div>
<div class="msgs">
<div class="u">How should I train today?</div>
<div class="c1"><span>Readiness is 78 and HRV is above normal for the third day. Your upper body is rested, so today is a good day for strength. Keep squats moderate after this morning’s run.</span></div>
<div class="u"${at('1300')}>I’d like a gym workout this evening, about an hour.</div>
<div class="dots"${at('2100 3200-in')}><i></i><i></i><i></i><span>Coach is thinking…</span></div>
<div class="c1"${at('3200')}><span data-type="3200,900">Here’s a full-body session for 5:30 PM:</span></div>
<div class="act"${at('4400')}>
<div class="al">${ic('wand')}Schedule · Thu, Oct 8</div>
<div class="sent an">Strength, full body</div>
${[['Squat', '3×8 · 80 kg'], ['Bench press', '3×8 · 62.5 kg'], ['Bent-over rows', '3×10 · 50 kg'], ['Romanian deadlift', '3×8 · 70 kg']].map(([a, b]) => `<div class="ar2"><span>${a}</span><span>${b}</span></div>`).join('')}
<span class="mut s">+1 more · 1 h</span>
<div class="ab"${at('6600:gone')}><span class="ok"${at('6200:press 6600-press')}>Confirm</span><span class="no">No</span><i class="br"></i>${['Shorter', 'Longer', 'Easier', 'Harder'].map(x => `<span class="q">${x}</span>`).join('')}<i class="br"></i><span class="q">Another day</span></div>
<div class="conf"${at('6600')}>${ic('check')}Proposal confirmed.</div>
</div>
</div>
<div class="inp"><span class="cam">${ic('camera')}</span><span class="mut">Message the coach…</span><span class="snd">${ic('up')}</span></div>
</div>`;

// Beside the phone: the confirmed workout lands in the week.
const coachWeek = `<div class="dm pad wk"${at('6900')}>
<div class="sl">Training · Week 41</div>
<div class="strip">${dayC('Mo', 5, 'run', 'ok')}${dayC('Tu', 6, 'bike', 'ok')}${dayC('We', 7, 'bike', 'off')}<div class="dc sel"><span class="wd today">Th</span><span class="ci empty"${at('7600:up')}><span class="rest">–</span>${ic('gym')}</span><span class="num dn">8</span></div>${dayC('Fr', 9, 'bike', 'up')}${dayC('Sa', 10, 'run', 'up')}</div>
<div class="day"><div class="row sp"><b>Today</b><span class="mut s" data-tx="0|42 min · 520 kcal;8000|1 h 42 min · 520 kcal">42 min · 520 kcal</span></div>
<div class="ar"><span class="ci ok">${ic('run')}</span><div><b>Morning run</b><span class="mut s">Run · 7:30 AM · 42 min · 8.2 km</span>${pct(98)}</div><span class="num">520<small>kcal</small></span></div>
<div class="ar new"${at('8000')}><span class="ci up">${ic('gym')}</span><div><b>Strength, full body</b><span class="mut s">Planned · 5:30 PM · 60 min</span></div>${ic('chev')}</div>
</div></div>`;

const each = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, merge(v)]));
// The welcome's pages (WelcomePages.swift), one before each part of the overview: a few of the app's own cards with
// the sample day that rise into place and move once the part is on screen, as they do before the sign-in.
const rise = ms => at(String(ms));
const actReadiness = `<div class="dm wc">
<div class="wcard"${rise(0)}><div class="row sp"><span class="mut">Readiness</span><span class="pill grn pop"${at('1200')}>high</span></div>
<div class="row w-wr"><span class="num"${n(0, 78, 200, 1300, 'i')}>78</span><p class="sent"${at('1400')}>Good night, third day in a row. <em class="grn">Go all in on strength today.</em></p></div></div>
<div class="w-two"><div class="wcard w-sm"${rise(250)}><span class="mut w-s2">Sleep</span><span class="num w-v">7:12</span>${range(16, 'amber-bar', 700)}<span class="w-nt2 amb2">89% of need</span></div>
<div class="wcard w-sm"${rise(400)}><span class="mut w-s2">HRV</span><span class="num w-v">64<small>ms</small></span>${range(83, 'green', 700)}<span class="w-nt2 grn">above normal</span></div></div>
</div>`;
// Training: Training mode's table of sets (TrainingModeView.swift, GymSetRow in TrainingModeParts.swift). Set 2
// is ticked off with Set done and set 3 comes up; a tap on its weight slides up the plate loader (PlateLoader.swift)
// with the bar loaded for 80 kg (25 + 5 a side), a tap on the 2.5 disc puts a pair on, Done, and set 3 says 85.
const tap = (on, off) => `<i class="w-tap"${at(`${on} ${off}-in`)}></i>`;
const DISCS = [25, 20, 15, 10, 5, 2.5, 1.25];
const plateCls = p => String(p).replace('.', '-');
const plate = (p, when) => `<span class="w-plate w-p${plateCls(p)}"${when ? at(String(when)) : ''}>${p}</span>`;
// Label, kg, reps, the row's timeline: W and 1 done already, 2 the set at hand until Set done, 3 after it.
const G_ROWS = [['W', 40, 300, ' w-did'], ['1', 80, 450, ' w-did'], ['2', 80, 1500, ' w-now', '1500-w-now 1500:w-did'], ['3', 80, 0, '', '1500:w-now']];
const gymRow = ([l, kg, done, cls, when]) => `<div class="w-row${cls}"${when ? at(when) : ''}><span class="w-l">${l}</span><span class="w-lt">—</span>
<span class="w-f num">${l === '3' ? `<b data-tx="0|80;5200|85">80</b>${tap(2300, 2600)}` : kg}</span><span class="w-f num">8</span><i class="w-rate${l === '1' ? ' w-m">M' : '">'}</i>
<span class="w-sq">${done ? `<i class="w-ok"${at(String(done))}>${ic('check')}</i>` : ''}</span></div>`;
const actTraining = `<div class="dm wc w-train">
<div class="wcard w-gym"${rise(0)}><div class="row sp w-gh"><b>Squat</b><span class="mut s">Exercise 1 of 3</span></div>
<div class="w-row w-th"><span>Sets</span><span>Last time</span><span>kg</span><span>Reps</span><i></i><i></i></div>
${G_ROWS.map(gymRow).join('\n')}
<div class="w-go">${ic('check')}Set done${tap(1200, 1500)}</div></div>
<div class="w-loader"${at('2700 5000-in')}><div class="row sp w-sh"><span class="mut">Keypad</span><span class="mut">Squat</span><b class="grn">Done${tap(4650, 4950)}</b></div>
<div class="w-big"><span class="num"${n(80, 85, 3850, 450, 'i')}>80</span><span class="mut">kg</span></div>
<div class="mut s w-sum" data-tx="0|25 + 5 per side + 20 kg bar;3850|25 + 5 + 2.5 per side + 20 kg bar">25 + 5 per side + 20 kg bar</div>
<div class="w-barbell" aria-hidden="true"><i class="w-rod"></i><span class="w-end">20</span><i class="w-collar"></i>${plate(25)}${plate(5)}${plate(2.5, 3850)}</div>
<div class="mut s w-addl">Add plates</div>
<div class="w-discs">${DISCS.map(p => `<span class="w-disc w-p${plateCls(p)}">${p}${p === 25 || p === 5 ? '<b>×1</b>' : p === 2.5 ? `<b${at('3850')}>×1</b>${tap(3600, 3900)}` : ''}</span>`).join('')}</div></div>
</div>`;
// Nutrition: Výživa's lunch row with the photo's food in it, the barcode being scanned and the drinks filling up to the goal, when the whale blows its spout.
const actFood = `<div class="dm wc">
<div class="wcard w-meal"${rise(0)}><span class="pill amb pop w-badge"${at('800')}>${ic('spark')}From a photo</span>
<div class="w-mr"><div><div class="row base w-mh"><b>Lunch</b><span class="w-ft s">12:30 PM</span><span class="num md">845</span><span class="num w-ft">/ 800 kcal</span></div>
${[['Carbs', 88, 100, 'carbs'], ['Protein', 61, 45, 'protein'], ['Fat', 26, 24, 'fat']].map(([k, v, t, c], i) => `<div class="w-mac"><span class="mut s"><i style="background:var(--${c})"></i>${k}</span><i class="bar"><b style="--w:${Math.min(100, v / t * 100).toFixed(0)}%;background:var(--${c})"${at(String(500 + i * 150))}></b></i><span class="s mono">${v} / ${t} g</span></div>`).join('')}
<span class="mut s">Chicken with rice, Plain Greek yogurt</span></div><span class="w-plus">${ic('plus')}</span></div></div>
<div class="w-two"><div class="wcard w-scan"${rise(200)}><span class="mut w-s2">Barcode</span><span class="w-code" aria-hidden="true">${[2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1].map(w => `<i style="width:${w}px"></i>`).join('')}<u class="w-corners"${at('600')}></u><b class="w-beam"></b></span></div>
<div class="wcard w-drink"${rise(350)}><span class="row w-s2"><i class="w-dot"></i>Drinks</span><svg class="w-whale" viewBox="0 0 110 110" aria-hidden="true"><defs><clipPath id="wh"><ellipse cx="50" cy="62" rx="38" ry="28"/><path d="M80 58C92 52 96 40 104 30C106 40 104 48 100 52C106 54 108 62 106 70C98 64 92 64 84 70Z"/></clipPath></defs><g clip-path="url(#wh)"><rect width="110" height="110" fill="#EAF3F9"/><g class="w-water"${at('600 2800:full')}><path class="w-wv" d="M0 0 q13.75 -3.25 27.5 0 t27.5 0 q13.75 -3.25 27.5 0 t27.5 0 q13.75 -3.25 27.5 0 t27.5 0 q13.75 -3.25 27.5 0 t27.5 0 V80 H0Z" fill="#4FA3D9"/><path class="w-wv w-wv2" d="M0 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 q9.1675 -2.6 18.335 0 t18.335 0 V80 H0Z" transform="translate(0 6)" fill="#2E86C1" fill-opacity=".35"/></g></g><g fill="none" stroke="#1B4F72" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="62" rx="38" ry="28"/><path d="M80 58C92 52 96 40 104 30C106 40 104 48 100 52C106 54 108 62 106 70C98 64 92 64 84 70"/><path d="M22 70Q32 76 42 70" stroke-width="2"/></g><circle cx="30" cy="56" r="3.6" fill="#1B1A17"/><circle cx="31.2" cy="54.8" r="1.1" fill="#fff"/><g class="w-spout"${at('4400')}><path d="M48 32C46 20 40 14 34 16M48 32C50 18 56 12 62 14M48 32V12" fill="none" stroke="#4FA3D9" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="12" r="2.5" fill="#4FA3D9"/><circle cx="64" cy="10" r="2.5" fill="#4FA3D9"/><circle cx="48" cy="6" r="2.5" fill="#4FA3D9"/></g></svg>
<span class="row base"><span class="num md"><span${n(1500, 2600, 2800, 1600, 'i')}>2,600</span> ml</span><span class="mut s" data-tx="0|1,100 ml to go;4400|goal reached">goal reached</span></span></div></div>
</div>`;
// Sleep: the bedtime from the alarm, tonight's choice and last night drawn stage by stage.
const actSleep = `<div class="dm wc">
<div class="w-two"><div class="wcard w-sm"${rise(0)}><span class="th ind">${ic('moon')}Bedtime</span><span class="num w-v">10:10<small>PM</small></span></div>
<div class="wcard w-sm"${rise(120)}><span class="th amb">${ic('sun')}Wake up</span><span class="num w-v">7:15<small>AM</small></span></div></div>
<div class="chips3"${rise(240)}>${[['Catch up', '8 h 30 min'], ['As usual', '8 h'], ['At least', '7 h']].map(([k, v], i) => `<span class="ch3 wcard"${i === 0 ? at('900:on') : ''}><b>${k}</b><span>${v}</span></span>`).join('')}</div>
<div class="wcard"${rise(360)}><div class="row sp base"><span class="mut">Last night</span><span class="num md">7:12</span></div>
<div class="hg" aria-hidden="true"><div class="hgl"><span>Awake</span><span>REM</span><span>Light</span><span>Deep</span></div><div class="hgt w-draw"${at('600')}>${NIGHT.map(([t, s, e]) => `<i class="${t}" style="left:${(s / 449 * 100).toFixed(2)}%;width:${Math.max(0.5, (e - s) / 449 * 100).toFixed(2)}%"></i>`).join('')}</div></div></div>
</div>`;
// Coach: the question, dots for a moment, the answer typed out, then its workout.
const COACH_SAYS = ['Readiness is 61 after 5 h 40 of sleep. ', 'Keep legs, go lighter:', ' squat 3 × 8 at 70 kg.'];
const typed = (() => { let t = 1600; return COACH_SAYS.map(x => { const at0 = t; t += x.length * 26; return [x, at0, x.length * 26]; }); })();
const actCoach = `<div class="dm wc coach2">
<div class="w-q"${rise(100)}>Bad night. Legs today?</div>
<div class="dots"${at('700 1600-in')}><i></i><i></i><i></i></div>
<div class="wcard w-a"${at('1600')}><p class="sent">${typed.map(([x, start, len], i) => `<span${i === 1 ? ' class="grn w-it"' : ''} data-type="${start},${len}">${x}</span>`).join('')}</p></div>
<div class="wcard row w-wo"${at(String(typed[2][1] + typed[2][2] + 200))}><span class="ib amb">${ic('lift')}</span><div><b>Legs, lighter</b><span class="mut s">40 min · 4 exercises</span></div><span class="w-add">Add</span></div>
</div>`;
// ---- Apple Watch (AurinWatch/: ReadinessHome.swift, GymSessionView.swift, FoodPage.swift, the watch face's
// complications in AurinWatchWidgets) on the sample day. The watch is dark only (WatchStyle.swift: W). ----
const WA = {ink: '#ECEAE6', muted: '#9AA39F', green: '#8FE6C4', amber: '#F2B46B', indigo: '#A5A1FF', blue: '#7CC3F0', red: '#F0907A'};
const wRange = (pos, c) => `<i class="aw-rb"><b style="left:${pos}%;background:${c}"></b></i>`;
// A ring of ten segments (the complications, the food ring): the share filled in its colour over a faint track.
const wRing = (size, r, width, frac, c, inner) => `<span class="aw-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" pathLength="100" stroke="${c}" stroke-opacity=".22" stroke-width="${width}" stroke-dasharray="8 2"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" pathLength="100" stroke="${c}" stroke-width="${width}" stroke-dasharray="${frac === 1 ? '8 2' : `${'8 2 '.repeat(Math.round(frac * 10)).trim()} 0 100`}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>${inner}</span>`;
const wTop = (left, time, right) => `<div class="aw-top"><span>${left}</span><span class="aw-time">${time}</span><span>${right}</span></div>`;
const wBtn = (icon, c) => `<span class="aw-ib" style="color:${c}">${ic(icon)}</span>`;
const watchHome = `<div class="aw-s" style="--gw:#163A2E">${wTop(wBtn('alarm', WA.indigo), '7:12', wBtn('chat', WA.amber))}
<div class="aw-hero"><span class="aw-n" style="font-size:58px">78</span><span class="aw-side"><span class="aw-k">Readiness</span><span class="aw-pill" style="color:${WA.green}">high</span></span></div>
<div class="aw-g">${[['Sleep', '7:12', '', 28, WA.amber, '89%'], ['Strain', '8.4', '', 14, WA.amber, 'of 11–14'], ['HRV', '64', 'ms', 76, WA.green, 'high']].map(([k, v, u, pos, c, note]) => `<div><span class="aw-k">${k}</span><span class="aw-n aw-v">${v}${u ? `<small>${u}</small>` : ''}</span>${wRange(pos, c)}<b style="color:${c}">${note}</b></div>`).join('')}</div>
<div class="aw-next"><span style="color:${WA.amber}">${ic('gym')}</span>Strength training · 45′ at 5:30 PM</div></div>`;
const watchGym = `<div class="aw-s" style="--gw:#3A2A17">${wTop('', '5:41', `<span class="aw-ib">${ic('menu')}</span>`)}
<div class="aw-ex"><b>Squat</b><span><i class="aw-ib aw-sm">${ic('minus')}</i>set 2/4<i class="aw-ib aw-sm">${ic('plus')}</i></span></div>
<div class="aw-two"><div class="aw-box on"><span class="aw-n">80</span><span class="aw-k">kg</span></div><div class="aw-box"><span class="aw-n">8</span><span class="aw-k">reps</span></div></div>
<div class="aw-done">Set done</div>
<div class="aw-two aw-tiles"><div><span class="aw-k">Time</span><b>12:40</b></div><div><span class="aw-k">Heart</span><b style="color:${WA.red}">128 <small>bpm</small></b></div></div></div>`;
const watchRest = `<div class="aw-s" style="--gw:#3A2A17">${wTop(`<b style="color:${WA.amber}">Rest</b>`, '5:42', '')}
<span class="aw-rest"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" stroke="#2A2C2E" stroke-width="9"/><circle cx="60" cy="60" r="50" stroke="${WA.amber}" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="56 100" transform="rotate(-90 60 60)"/></svg><span class="aw-n">1:24</span></span>
<div class="aw-c"><span class="aw-k">Next · </span>Squat 80 kg × 8</div></div>`;
const watchFood = `<div class="aw-s" style="--gw:#163047">${wTop('', '12:20', '')}
<div class="aw-food">${wRing(70, 29, 7, .52, WA.amber, `<span class="aw-in"><span class="aw-n">1,380</span><small>OF 2,650</small></span>`)}<div><b style="color:${WA.amber}">Food</b><span class="aw-news">1,270 kcal left</span><span class="aw-k">lunch logged 12:30</span></div></div>
<div class="aw-mac">${[['Carbs', 177, 330, '#FFC274'], ['Protein', 84, 150, '#83C7FF'], ['Fat', 36, 80, '#B3A1FF']].map(([k, v, t, c]) => `<div><b style="color:${c}">${k}</b>${v}/${t} g<i><b style="width:${Math.round(v / t * 100)}%;background:${c}"></b></i></div>`).join('')}</div>
<div class="aw-water"><span style="color:${WA.blue}">${ic('drop')}</span><div><b>1.5</b> <span class="aw-k">/ 2.6 L</span><i><b style="width:58%"></b></i></div><span class="aw-plus">+250</span></div></div>`;
const watchFace = `<div class="aw-s aw-face"><div class="aw-date">THU<b>8</b></div><div class="aw-clock">7:12</div>
<div class="aw-comps">${[['sun', '78', .78, WA.green], ['moon', '7:12', .89, WA.indigo], ['flame', '8.4', .6, WA.amber]].map(([icon, v, f, c]) => wRing(56, 23, 5, f, c, `<span class="aw-in" style="color:${c}">${ic(icon)}<b${v.length > 3 ? ' style="font-size:12.5px"' : ''}>${v}</b></span>`)).join('')}</div></div>`;
// The watch section's steps: [the glow token behind the watch, title, text, screen].
export const WATCH = [
  ['glow-today', 'Your morning, at a glance.', 'Raise your wrist: readiness, sleep, strain and HRV, as on Today, and what’s next today in one line.', watchHome],
  ['glow-training', 'Lift without your phone.', 'Set done on the wrist, the weight on the crown. Your heart rate and calories go into the same workout.', watchGym],
  ['glow-training', 'Rest, then a tap.', 'The rest counts down on the wrist and taps you when it’s time, with the next set ready.', watchRest],
  ['glow-health', 'Water in one tap.', 'What’s left to eat today, the macros, and +250 for a glass of water. Your iPhone gets it at once.', watchFood],
  ['glow-health', 'On your watch face.', 'Readiness, last night’s sleep and today’s strain sit beside the time, so you don’t even open the app.', watchFace]];

export const ACTS = each({readiness: actReadiness, training: actTraining, food: actFood, sleep: actSleep, coach: actCoach});

export const DEMOS = each({sleepNight, sleepNeed, dial, tonight, readyParts, journal, strainMade, week, builder, gymParts, tmTable, tmTick, tmRest, tmDone, foodTarget, foodAdd, drinks, coachWeek});
export const SCREENS = each({strain: strainScreen, done: doneScreen, coach: coachScreen});

// The demos' look: the app's cards (radius 22), Instrument Serif for numbers, Newsreader for sentences.
export const demoCss = `
@font-face{font-family:"Instrument Serif";src:url(/site/fonts/instrument-serif.woff2) format("woff2");font-display:swap}
.dm{--num:"Instrument Serif","New York",Georgia,serif;font:15px/1.35 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;color:var(--text);text-align:left;width:380px}
.dm.pad,.app .card{padding:16px 18px 18px}
.dm b,.app b{font-weight:600}
.di{width:1em;height:1em;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.14em}
.di.flip{transform:scaleX(-1)}.di.down{transform:rotate(180deg)}
.num{white-space:nowrap;font-family:var(--num);font-weight:400;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.num.big{font-size:64px;line-height:1}.num.big2{font-size:46px;line-height:1}.num.md{font-size:22px}.num small{font:500 10px -apple-system,system-ui,sans-serif;color:var(--muted);margin-left:2px}
.sent{font-family:Newsreader,"New York",Georgia,serif;font-weight:400}
.sent.h{font-size:26px;line-height:1.1;margin:2px 0 4px}.sent.h2{font-size:24px;margin-bottom:6px}
.sl{font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:14px 0 8px}
.dm>.sl:first-child,.dm>.row:first-child .sl{margin-top:0}
.mut{color:var(--muted)}.faint{color:var(--muted)}.s{font-size:12.5px}.b{font-weight:600}.mono{font-variant-numeric:tabular-nums}
.grn{color:var(--green)}.amb{color:var(--amber)}.ind{color:var(--indigo)}.rust{color:var(--rust)}.sec{color:var(--sec)}
.row{display:flex;align-items:center;gap:10px}.row.sp{justify-content:space-between}.row.base{align-items:baseline}.row.gap{gap:8px;flex-wrap:wrap;margin-top:10px}
.pill{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12.5px;font-weight:600}
.pill.ind{color:var(--indigo);background:var(--lilac)}.pill.grn{color:var(--green);background:var(--green-soft)}.pill.amb{color:var(--amber);background:var(--amber-soft)}
.list{display:grid}.li{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:40px;border-top:1px solid var(--line)}.li:first-child{border-top:0}
.btn{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;height:44px;margin-top:14px;border-radius:999px;background:var(--button);color:var(--on-button);font-weight:600;font-size:15px;transition:transform .2s,opacity .3s}
.btn.dark{background:var(--button)}.btn.press{transform:scale(.96)}.btn.ok{background:var(--green)}
.hint{margin-top:10px;font-size:12.5px;color:var(--muted);text-align:center}
.ib{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;flex:none}
.ib.amb{color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)}.ib.amb2{color:var(--amber-bar);background:color-mix(in srgb,var(--amber-bar) 14%,transparent)}
.ib.rust{color:var(--rust);background:color-mix(in srgb,var(--rust) 14%,transparent)}.ib.ind{color:var(--indigo);background:color-mix(in srgb,var(--indigo) 14%,transparent)}
.lg.au{background:var(--panel);box-shadow:inset 0 0 0 1px var(--line);padding:1px}.lg.au svg{width:100%;height:100%}
.lg{display:inline-grid;width:15px;height:15px;border-radius:26%;overflow:hidden;vertical-align:-3px;margin-right:5px}.lg img{width:100%;height:100%}
.dm .uh-tile{border-radius:26%}

/* Timeline: an element waiting for "in" (the player marks it .wait) stays hidden until then. Without JS all shows. */
.js .wait:not(.in){opacity:0;transform:translateY(8px)}
.wait{transition:opacity .45s ease,transform .55s cubic-bezier(.16,1,.3,1)}

/* Sleep. */
.hg{display:grid;grid-template-columns:44px 1fr;gap:6px;margin:12px 0 2px}.hgl{display:grid;grid-template-rows:repeat(4,18px);font-size:11px;color:var(--muted);align-items:center}
.hgt{position:relative;height:72px}.hgt i{position:absolute;height:13px;border-radius:3px}.hgt .a{top:2.5px;background:#E0A46A}.hgt .r{top:20.5px;background:#7C74E8}.hgt .l{top:38.5px;background:#A9B8EC}.hgt .d{top:56.5px;background:#3B3A99}
.hgx{display:flex;justify-content:space-between;margin:0 0 12px 50px;font-size:11px;color:var(--faint,var(--muted))}
.stg{display:grid;gap:7px}.sr{display:grid;grid-template-columns:52px 1fr 40px 38px;align-items:center;gap:8px;font-size:13.5px}.sr .num{font-size:17px;text-align:right}.sr .mut{font-size:12px;text-align:right}
.bar{display:block;height:7px;border-radius:9px;background:var(--track);overflow:hidden}.bar b{display:block;height:100%;width:var(--w);border-radius:9px;transition:width 1s cubic-bezier(.16,1,.3,1)!important}
.js .bar b:not(.in){opacity:1!important;transform:none!important;width:0}
.bar .d{background:#3B3A99}.bar .r{background:#7C74E8}.bar .l{background:#A9B8EC}.bar .a{background:#E0A46A}
.tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:12px;border-top:1px solid var(--line)}.tot .sent{font-size:19px}.tot .num{font-size:30px;color:var(--indigo)}
.dialbox{padding-bottom:12px}
.dial{position:relative;width:250px;height:250px;margin:0 auto;touch-action:none}
.dial svg{display:block;width:100%;height:100%}
.dial .trk{fill:none;stroke:var(--track);stroke-width:22}
.dial .arc{fill:none;stroke:var(--indigo);stroke-width:22;stroke-linecap:round}
.dial text{font:500 11px -apple-system,system-ui,sans-serif;fill:var(--muted);text-anchor:middle}
.dial .usual{fill:var(--muted)}
.dial .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.dial .len{font-size:38px;line-height:1}
.dial .hd{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;padding:0;border:0;border-radius:50%;background:var(--panel);box-shadow:0 1px 3px rgba(0,0,0,.25);display:grid;place-items:center;cursor:grab;font-size:15px}
.dial .hd:active{cursor:grabbing}.dial .moon{color:var(--indigo)}.dial .sun{color:var(--amber)}
.dial .hd:focus-visible{outline:2px solid var(--indigo);outline-offset:2px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.tile{padding:10px 12px;border-radius:16px;background:var(--bg)}
.th{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}.th .di{font-size:12px}.th.ind .di{color:var(--indigo)}.th.amb .di{color:var(--amber)}
.tile .num{display:block;font-size:30px;line-height:1.15}
.chips3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ch3{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border-radius:16px;background:var(--bg);border:1.5px solid transparent;transition:background .35s,border-color .35s}
.ch3 b{font-size:14px;font-weight:500}.ch3 span{font-size:12px;color:var(--muted)}
.ch3.on{background:var(--lilac);border-color:var(--indigo)}

/* Readiness. */
.pr{padding:10px 0 12px;border-top:1px solid var(--line)}.pr:first-of-type{border-top:0}.pr .num.md{font-size:20px}
.rb{position:relative;display:block;height:6px;margin:8px 0 8px;border-radius:9px;background:color-mix(in srgb,var(--text) 7%,transparent)}
.rb b{position:absolute;left:33.3%;width:33.3%;top:0;bottom:0;background:color-mix(in srgb,var(--text) 30%,transparent)}
.rb u{position:absolute;top:50%;left:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2.5px var(--panel);transition:left 1s cubic-bezier(.16,1,.3,1)!important}
.js .rb u{opacity:1!important;transform:none!important}.rb u.in,html:not(.js) .rb u{left:var(--x)}
.hist{display:flex;align-items:flex-end;gap:4px;height:70px;margin-bottom:10px}.hist i{flex:1;height:var(--h);border-radius:3px 3px 1px 1px;background:var(--c);opacity:.78;transform-origin:bottom;transition:transform .6s cubic-bezier(.16,1,.3,1),opacity .3s!important}
.hist i.today{opacity:1}.js .hist i.wait:not(.in){transform:scaleY(0)}
.pr2{display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:10px;padding:8px 0 4px;border-top:1px solid var(--line)}.pr2 b{display:block;font-size:14px}.pr2 .num.md{font-size:20px}.pr2 .rb{grid-column:1;margin:6px 0}.pr2 .nd{padding:14px 16px;border-radius:16px;background:var(--panel2,color-mix(in srgb,var(--text) 3%,transparent))}.nt{font-weight:500;font-size:15px}.nr{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);padding:3px 0}
.ndd{margin-top:10px;padding-top:12px;border-top:1px solid var(--line)}.num.amb{color:var(--amber)}.nd .kbar{margin-top:8px}.nd .kbar b{width:0}.nd .kbar b.in,html:not(.js) .nd .kbar b{width:var(--w)}
.pr3{padding:10px 0 12px;border-top:1px solid var(--line)}.pr3:first-of-type{border-top:0}.pr3 b{font-weight:500;font-size:15px}.pr3 .num.md{font-size:20px}.pr3 .rb{margin:10px 0 8px}
.fo{font-size:12.5px;line-height:1.3;margin-left:10px}.mac3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.mac3>div{display:flex;flex-direction:column;gap:3px}.mac3 .mut i{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;vertical-align:middle}.mac3 small{font-family:var(--num);font-size:12px;color:var(--muted)}.alln{margin-top:12px}
.pts{grid-column:2;margin:0}
.pts{display:table;margin-left:auto;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--text) 6%,transparent);font-size:12px;font-weight:500}
.jt{display:flex;flex-wrap:wrap;gap:6px}
.jc{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px 0 6px;border-radius:999px;background:var(--bg);font-size:13px}
.jc i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--green);color:#fff;font-size:12px}.jc.no i{background:var(--track);color:var(--muted)}
.js .jc[data-at]:not(.in){opacity:1!important;transform:none!important}.js .jc[data-at]:not(.in) i{background:var(--track);color:transparent}
.jh{font-size:21px;margin:14px 0 4px}
.imp{display:grid;gap:4px;margin-top:6px;position:relative}
.imp::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;background:color-mix(in srgb,var(--text) 22%,transparent)}
.ir{display:grid;grid-template-columns:1fr 1fr;align-items:center;height:28px;font-size:12.5px}
.ir .nm{grid-column:1;grid-row:1;justify-self:end;padding-right:10px;color:var(--sec)}.ir .nm.r{grid-column:2;justify-self:start;padding:0 0 0 10px}
.iv{grid-row:1;grid-column:2;position:relative;height:14px;width:var(--w);border-radius:0 6px 6px 0;background:linear-gradient(90deg,color-mix(in srgb,var(--green) 35%,transparent),var(--green));transition:width .9s cubic-bezier(.16,1,.3,1)!important}
.iv.neg{grid-column:1;justify-self:end;border-radius:6px 0 0 6px;background:linear-gradient(270deg,color-mix(in srgb,var(--rust) 35%,transparent),var(--rust))}
.iv b{position:absolute;left:calc(100% + 6px);top:50%;transform:translateY(-50%);font-size:15px;color:var(--green);white-space:nowrap}.iv.neg b{left:auto;right:calc(100% + 6px);color:var(--rust)}
.js .iv[data-at]:not(.in){opacity:1!important;transform:none!important;width:0}.js .iv:not(.in) b{opacity:0}

/* Strain. */
.tgt{display:flex;align-items:center;gap:12px;margin:4px 0 10px}.tgt i{position:relative;flex:1;height:12px;border-radius:9px;background:var(--track);overflow:hidden}
.tgt .band{position:absolute;left:${(11.4 / 21 * 100).toFixed(1)}%;width:${(3 / 21 * 100).toFixed(1)}%;top:0;bottom:0;background:color-mix(in srgb,var(--green) 45%,transparent)}
.tgt .fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:9px;background:var(--amber-bar);transition:width .9s cubic-bezier(.16,1,.3,1)!important}
.js .tgt .fill{opacity:1!important;transform:none!important}.tgt .fill.a{width:${(5.1 / 21 * 100).toFixed(1)}%}.tgt .fill.b{width:${(8.4 / 21 * 100).toFixed(1)}%}
.tgt .fill.c{width:${(16.7 / 21 * 100).toFixed(1)}%;background:linear-gradient(90deg,var(--amber-bar) ${(8.4 / 16.7 * 100).toFixed(1)}%,color-mix(in srgb,var(--amber-bar) 35%,transparent) 0)}
html:not(.js) .tgt .fill{width:${(16.7 / 21 * 100).toFixed(1)}%}
.tgt .num{font-size:28px;min-width:48px;text-align:right}
.mi{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}.mi b{display:block;font-size:14px}.mi>.num{font-size:20px}
.sq{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;color:#fff;font-size:18px}.sq.amb{background:var(--amber-bar)}.sq.sand{background:#E6D3B5;color:#8A6D3B}.sq.dash{border:1.5px dashed var(--amber-bar);color:var(--amber-bar)}
.note{margin-top:8px;font-size:13px;font-weight:600;color:var(--green)}

/* Training week. */
.strip{display:grid;grid-template-columns:repeat(6,1fr);gap:2px}
.dc{display:flex;flex-direction:column;align-items:center;gap:5px;opacity:.6;transform:scale(.92)}.dc.sel{opacity:1;transform:none}
.wd{font-size:11.5px;font-weight:500;color:var(--muted)}.wd.today{color:var(--amber);font-weight:700}
.ci{position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;font-size:17px;--c:var(--muted);color:var(--c);background:color-mix(in srgb,var(--muted) 14%,transparent);box-shadow:inset 0 0 0 2px var(--c);transition:.5s cubic-bezier(.16,1,.3,1);transition-property:background-color,color,box-shadow,outline-color,opacity,transform}
.ci.ok,.ci.done{background:color-mix(in srgb,var(--green) 14%,transparent)}.ci.off{background:color-mix(in srgb,var(--amber-bar) 14%,transparent)}.ci.out{background:color-mix(in srgb,var(--blue) 14%,transparent)}
.ci.ok,.ci.done{--c:var(--green)}.ci.off{--c:var(--amber-bar)}.ci.out{--c:var(--blue)}
.ci.up:not(.done){--c:var(--muted);background:color-mix(in srgb,var(--muted) 6%,transparent);box-shadow:none;outline:2px dashed color-mix(in srgb,var(--muted) 70%,transparent);outline-offset:-2px}
.ci.done{transform:scale(1.08)}
.js .ci[data-at]{opacity:1!important;transform:none!important}.js .ci.done[data-at]{transform:scale(1.08)!important}
.sel .ci{box-shadow:inset 0 0 0 2px var(--c),0 0 0 4px var(--panel),0 0 0 6px var(--text)}.sel .ci.up:not(.done){box-shadow:0 0 0 4px var(--panel),0 0 0 6px var(--text)}
.ci.empty{--c:transparent}.ci.empty .di{opacity:0;transform:scale(.4);transition:opacity .5s,transform .5s}.ci.empty .rest{position:absolute;color:var(--muted);transition:opacity .3s}
.ci.empty.up{--c:var(--muted)}.ci.empty.up .di{opacity:1;transform:none}.ci.empty.up .rest{opacity:0}
.js .ci.empty[data-at]:not(.up){opacity:1!important;transform:none!important}
.dn{font-size:15px}
.pc{display:block;min-height:14px;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}.pc.ok{color:var(--green)}.pc.off{color:var(--amber)}
.handle{display:flex;flex-direction:column;align-items:center;gap:3px;margin:8px 0 2px;font-size:11px;font-weight:500;color:var(--muted);transition:transform .4s}
.handle i{width:34px;height:4px;border-radius:4px;background:color-mix(in srgb,var(--muted) 50%,transparent)}
.handle.pull{transform:translateY(8px)}.js .handle[data-at]{opacity:1!important;transform:none!important}.js .handle.pull{transform:translateY(8px)!important}
.month{display:grid;grid-template-rows:0fr;transition:grid-template-rows .6s cubic-bezier(.16,1,.3,1)}.month>*{overflow:hidden}
.month{opacity:1!important;transform:none!important}.month.open{grid-template-rows:1fr}
.month>div{min-height:0}.mh{display:flex;flex-direction:column;align-items:center;padding-top:6px}.mh b{font-size:14px}
.mg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:6px 0 4px;overflow:hidden;min-height:0}
.mw{font-size:10.5px;font-weight:600;color:var(--muted);text-align:center}
.mg .md{display:flex;flex-direction:column;align-items:center;gap:1px;padding:2px 0;border-radius:9px;font-size:10.5px;min-height:36px}.mg .md.sel{background:var(--track)}
.mg .md .ci{width:20px;height:20px;font-size:10px}.mg .md .ci.up{outline-width:1.5px}
.day{margin-top:8px;padding-top:10px;border-top:1px solid var(--line)}.day>.row{margin-bottom:4px}
.ar{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:8px 0}
.ar .ci{width:34px;height:34px;font-size:15px}.ar b{display:block;font-size:14px}.ar .num{font-size:18px}.ar>.di{color:var(--muted)}
.src{display:block;font-size:12px;color:var(--muted);margin:2px 0}
.ar.new{margin:0 -8px;padding:8px;border-radius:14px;background:color-mix(in srgb,var(--green) 10%,transparent)}

/* Gym builder and parts. */
.seg{display:flex;padding:3px;border-radius:10px;background:color-mix(in srgb,var(--text) 6%,transparent)}
.seg span{flex:1;text-align:center;padding:6px 0;border-radius:8px;font-size:13px;transition:background .3s,box-shadow .3s}
.seg span.on{background:var(--panel);box-shadow:0 1px 3px rgba(0,0,0,.12);font-weight:600}
.js .seg span[data-at]{opacity:1!important;transform:none!important}
.eq{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border-radius:16px;background:var(--bg)}.eq b{display:block;font-size:14px}.eq>.di{color:var(--muted)}
.js .btn[data-at]{opacity:1!important;transform:none!important}
.btn .sp1{display:none;width:15px;height:15px;border-radius:50%;border:2px solid color-mix(in srgb,var(--on-button) 35%,transparent);border-top-color:var(--on-button);animation:spin .8s linear infinite}
.btn.busy .sp1{display:block}.btn.busy>.di{display:none}.btn.press.js{transform:scale(.96)}
@keyframes spin{to{transform:rotate(360deg)}}
.bld{display:grid;min-height:420px}
/* Both stages share one cell, so the box is as tall as the longer one: the workout with its Save button. */
.stage1,.stage2{grid-area:1/1}
.stage1{transition:opacity .4s}.stage1.gone{opacity:0!important;pointer-events:none}
.js .stage1[data-at]{opacity:1;transform:none}.js .stage1.gone{opacity:0!important}
html:not(.js) .stage1{display:none}
.ss{display:grid}.ex{position:relative;display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:13px}
.ex:first-child{border-top:0}.ex b{display:block;font-size:14px;font-weight:500}.ex .ix{font-size:18px;color:var(--muted)}
.ex.sup{padding-left:10px}.ex.sup::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:3px;background:var(--indigo)}
.md2{font-size:20px}
.tbar{display:flex;gap:4px;height:8px;margin:10px 0 6px}.tbar i{border-radius:9px;transition:flex .6s,opacity .4s}
.tbar .w{background:var(--amber)}.tbar .l{background:color-mix(in srgb,var(--text) 85%,transparent)}.tbar .c{background:var(--rust)}.tbar .sx{background:var(--indigo)}
.tbar .c{flex:0;opacity:0}.tbar .c.on,html:not(.js) .tbar .c{flex:10;opacity:1}
.js .tl .tc:not(.on){display:none}
.gparts{position:relative;padding:4px 8px;border-radius:20px;background:var(--bg)}
.pt{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;min-height:54px;border-top:1px solid var(--line);background:var(--bg);transition:transform .6s cubic-bezier(.16,1,.3,1),box-shadow .3s,opacity .3s}
.pt:first-child{border-top:0}.pt b{display:block;font-size:14px;font-weight:500}
.gro{font-weight:600;color:var(--amber);margin:14px 0 8px}
.gpr{display:grid;justify-items:end;align-items:center}.gpr>*{grid-area:1/1}
.gar{display:flex;gap:6px;opacity:0;transition:opacity .3s}.gar i{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:color-mix(in srgb,var(--text) 8%,transparent)}.gar svg{width:14px;height:14px}
.gparts.reo .gar{opacity:1}.gparts.reo .pt .tg{opacity:0!important}.gparts.reo .pt{opacity:1}
.p1 .gar i:first-child,.p4 .gar i:last-child{opacity:.3}
.tg{position:relative;width:54px;height:24px;border-radius:99px;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--text) 28%,transparent);background:transparent;transition:background .3s,box-shadow .3s}
.tg i{position:absolute;left:6px;top:6px;width:12px;height:12px;border-radius:99px;background:color-mix(in srgb,var(--text) 45%,transparent);transition:transform .35s cubic-bezier(.3,1.5,.5,1),width .35s,height .35s,left .35s,top .35s,background .3s}
.tg.on{background:var(--green);box-shadow:none}.tg.on i{left:2px;top:2px;width:32px;height:20px;transform:translateX(18px);background:#fff;box-shadow:0 1.5px 3px rgba(0,0,0,.14)}
.js .tg[data-at]{opacity:1!important;transform:none!important}
.p2:has(.tg:not(.on)){opacity:.45}
.gparts.swap .p2{transform:translateY(54px)}.gparts.swap .p3{transform:translateY(-54px)}
.js .gparts[data-at]{opacity:1!important;transform:none!important}

/* Training mode. */
.tm .sent.h{margin-bottom:8px}
.th2,.st{display:grid;grid-template-columns:30px 1fr 54px 44px 40px 30px;align-items:center;gap:6px}
.th2{padding:0 8px 4px;font-size:10px;letter-spacing:.02em;font-weight:500;text-transform:uppercase;color:var(--muted)}
.st{padding:5px 8px;border-radius:12px;transition:background .4s,box-shadow .4s,opacity .4s}
.st .sl2{font-weight:600;font-size:14px;color:var(--sec)}.st .v{font-size:21px;text-align:center}
.st.cur{background:var(--track);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--amber) 55%,transparent)}.st.cur .sl2{color:var(--amber)}
.st.next{opacity:.6}.st.next .sl2,.st.next .v{color:var(--muted)}
.st .ed{display:grid;place-items:center;height:32px;border-radius:8px;background:var(--panel)}
.st .ed span{display:inline-block}
.tk{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;box-shadow:inset 0 0 0 1.5px var(--line);color:transparent;font-size:13px;transition:.35s;transition-property:background-color,color,box-shadow}
.st.done .tk{background:var(--green);color:#fff;box-shadow:none}.st.cur .tk{box-shadow:inset 0 0 0 1.5px var(--amber)}
.js .st[data-at]{opacity:1;transform:none}.js .st.add[data-at]:not(.in){opacity:0;transform:translateY(-8px)}
.ip{display:inline-grid;place-items:center;min-width:34px;height:22px;padding:0 6px;border-radius:99px;font:700 11.5px system-ui,sans-serif;font-style:normal;--c:var(--muted);box-shadow:inset 0 0 0 1.5px var(--c);color:var(--text)}
.ip.w{--c:var(--muted)}.ip.m{--c:var(--indigo)}.ip.dash{box-shadow:none;outline:1.5px dashed color-mix(in srgb,var(--muted) 75%,transparent);outline-offset:-1.5px;color:var(--muted)}
.ip.dash.h,.ip.dash.f{outline:0;box-shadow:inset 0 0 0 1.5px var(--amber);color:var(--text)}.ip.none{outline:1.5px dashed var(--muted);outline-offset:-1.5px;opacity:.5}
.js .ip[data-at]{opacity:1!important;transform:none!important}
.pb{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:99px;box-shadow:inset 0 0 0 1px var(--line);font-size:12px;font-weight:500;color:var(--sec);transition:transform .2s,background .2s}
.pb.press{transform:scale(.92);background:var(--track)}.js .pb[data-at]{opacity:1!important;transform:none!important}.js .pb.press{transform:scale(.92)!important}
.tag{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:99px;font-size:11.5px;font-weight:600}.tag.rust{color:var(--rust);background:color-mix(in srgb,var(--rust) 12%,transparent)}
.lpick{position:absolute;right:14px;top:60px;z-index:3;display:grid;grid-template-columns:auto auto;gap:2px 6px;padding:8px;border-radius:16px;background:var(--panel);box-shadow:0 20px 40px -12px rgba(60,40,10,.45),0 0 0 1px var(--line)}
.lr{display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:10px;font-size:12.5px;transition:background .3s}.lr .ip{min-width:30px;height:20px}
.lr.on{background:var(--track);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--amber) 70%,transparent)}
.js .lr[data-at]{opacity:1!important;transform:none!important}
.rest .ring{position:relative;width:200px;height:200px;margin:0 auto}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}.rt{fill:none;stroke:var(--track);stroke-width:11}.ra{fill:none;stroke:var(--green);stroke-width:11;stroke-linecap:round}
.rc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.rtm{font-size:58px;line-height:1}
.c3{display:grid!important;grid-template-columns:repeat(3,1fr)}.pb2{display:grid;place-items:center;height:40px;border-radius:99px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 18%,transparent);font-weight:500;font-size:14px;transition:transform .2s,background .2s}
.pb2.press{transform:scale(.93);background:var(--track)}.js .pb2[data-at]{opacity:1!important;transform:none!important}.js .pb2.press{transform:scale(.93)!important}
.nowc{margin-top:12px;padding:10px 14px;border-radius:16px;background:var(--bg)}.nowc b{font-size:14px}
.thumbs{display:flex;gap:6px}.thumbs i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--track);color:var(--muted);font-size:14px;transition:.3s;transition-property:background-color,color,opacity,transform}
.thumbs .tu.on{background:var(--green);color:#fff}.js .thumbs i[data-at]{opacity:1!important;transform:none!important}
.suit{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.suit span{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:14px;background:var(--bg);font-size:22px;transition:.3s;transition-property:background-color,color,opacity,transform}
.suit b{font-size:11.5px;font-weight:500}.suit span.on{background:var(--button);color:var(--on-button)}.js .suit span[data-at]{opacity:1!important;transform:none!important}

/* Food. */
.wh{display:inline-flex;align-items:center;gap:7px;font-weight:500;color:var(--sec)}.wh i{width:8px;height:8px;border-radius:50%}
.kbar{display:block;height:6px;margin:10px 0 12px;border-radius:9px;background:var(--track);overflow:hidden}
.kbar b{display:block;height:100%;width:var(--w);background:var(--amber-bar);border-radius:9px;transition:width 1.1s cubic-bezier(.16,1,.3,1)!important}
.js .kbar b{opacity:1!important;transform:none!important}.kbar b.t,html:not(.js) .kbar b{width:${(1380 / 2650 * 100).toFixed(1)}%}
.mac{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.mac>div{display:flex;flex-direction:column;gap:3px}.mac .num.md{font-size:19px}.mac small{font-family:var(--num);font-size:12px;color:var(--muted)}
.mb{display:block;height:3px;margin-top:4px;border-radius:3px;background:var(--track);overflow:hidden}.mb b{display:block;height:100%;width:var(--w)}
.coach{margin-top:14px;padding:12px 14px;border-radius:16px;background:var(--bg)}.ch4{display:flex;align-items:center;gap:6px;color:var(--indigo);font-weight:500;font-size:13.5px}
.coach .sent{margin-top:4px;font-size:17px;line-height:1.3;min-height:3.9em}
.fa{position:relative;min-height:524px;overflow:hidden}
.meal{display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 10px;border-radius:99px;background:color-mix(in srgb,var(--text) 6%,transparent);font-size:13px;font-weight:600}.meal .di{font-size:10px}
.srch{display:flex;align-items:center;gap:10px;height:44px;margin-top:12px;border-bottom:1px solid color-mix(in srgb,var(--text) 25%,transparent);font-size:17px}.srch .di{font-size:18px;color:var(--muted)}
.tiles6{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}
.tiles6 span{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:62px;border-radius:16px;background:var(--bg);font-size:12.5px;font-weight:500;transition:transform .2s,background .2s}.tiles6 .di{font-size:19px}
.tiles6 span.press{transform:scale(.93);background:var(--track)}.js .tiles6 span[data-at]{opacity:1!important;transform:none!important}
.seg2{display:grid;grid-template-columns:1fr 1fr;margin-top:16px;padding:2px;border-radius:9px;background:var(--track);font-size:13px;font-weight:500}.seg2 span{padding:5px 0;border-radius:7px;text-align:center}.seg2 .on{background:var(--panel);box-shadow:0 1px 3px rgba(0,0,0,.08);font-weight:600}
.fa .li{padding:7px 0}.fa .li b{display:block;font-size:14px}.fa .li .num{font-size:18px}
.scn{position:absolute;inset:0;padding:16px 18px 18px;background:var(--panel);transition:opacity .4s}.js .scn.wait:not(.in){transform:none}
.sl0{font-size:11px;font-weight:500;letter-spacing:.16em;color:var(--muted)}.fa .cb{width:32px;height:32px;font-size:14px}
.finder{position:absolute;left:18px;right:18px;top:68px;transition:opacity .4s}.js .finder:not(.in){opacity:0}
.cam{position:relative;height:200px;border-radius:24px;background:#1D2020;overflow:hidden}
.cam .bc{position:absolute;left:50%;top:50%;width:150px;height:84px;margin:-42px 0 0 -75px;border-radius:6px;background:#f6f3ec repeating-linear-gradient(90deg,#1b1a17 0 2px,transparent 2px 4px,#1b1a17 4px 7px,transparent 7px 9px,#1b1a17 9px 10px,transparent 10px 13px);background-size:100% 70%;background-repeat:no-repeat;background-position:center 30%;box-shadow:0 0 0 10px #f6f3ec}
.cam .scan{position:absolute;left:24px;right:24px;height:2px;top:30%;background:#ff4a3d;box-shadow:0 0 12px #ff4a3d;animation:scan 1.4s ease-in-out infinite alternate}
@keyframes scan{to{top:70%}}
.cr{position:absolute;width:26px;height:26px;border:3px solid rgba(255,255,255,.9)}.cr.tl{left:20px;top:20px;border-right:0;border-bottom:0;border-radius:14px 0 0 0}.cr.tr{right:20px;top:20px;border-left:0;border-bottom:0;border-radius:0 14px 0 0}.cr.bl{left:20px;bottom:20px;border-right:0;border-top:0;border-radius:0 0 0 14px}.cr.br{right:20px;bottom:20px;border-left:0;border-top:0;border-radius:0 0 14px 0}
.aim{margin:18px 0 0;font-size:19px;text-align:center;color:color-mix(in srgb,var(--text) 85%,transparent)}
.finder .pk{display:flex;width:max-content;height:36px;margin:12px auto 0;padding:0 15px;font-size:13px;font-weight:500}
.res{margin-top:14px}.js .res.wait:not(.in){transform:translateY(24px)}
.olp{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;border-radius:99px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 20%,transparent);font-size:12px;font-weight:600}.olp .di{font-size:12px}
.sent.h3{font-size:24px;line-height:1.1;margin-top:4px}
.nc{display:grid;grid-template-columns:repeat(4,1fr);margin:12px 0 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.nc>div{display:flex;flex-direction:column;padding:8px 0}
.wf{display:flex;align-items:center;height:44px;margin-top:14px;border-radius:99px;background:var(--track);font-size:15px;font-weight:500}.wf b{width:96px;padding-right:14px;text-align:right;font-size:17px}.wf i{width:2px;height:100%;background:var(--panel)}.wf span{flex:1;padding:0 14px}.wf .di{margin-right:14px;color:var(--muted)}
.wheel{position:relative;display:flex;height:96px;margin-top:8px;overflow:hidden;-webkit-mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent)}
.wheel::before{content:"";position:absolute;left:0;right:0;top:32px;height:32px;border-radius:9px;background:var(--track)}
.wheel .col{position:relative;flex:none;width:90px;text-align:center}.wheel .col.p{width:56px}.wheel .col.u{flex:1;padding-left:14px;text-align:left}
.wheel ul{margin:0;padding:0;list-style:none;transition:transform 1s cubic-bezier(.16,1,.3,1)}.wheel li{height:32px;font-size:17px;font-weight:600;line-height:32px;white-space:nowrap}
.js .wheel ul[data-at]{opacity:1!important;transform:none!important}.wheel ul.on,.js .wheel ul.on{transform:translateY(-96px)!important}
.fa .res .meal{margin-top:10px}.fa .res .btn{margin-top:10px}

/* Screens built here, in the phone: drawn at the app's 390 pt and scaled to the screen. */
.scr .app{position:absolute;left:0;top:0;width:390px;height:848px;zoom:calc(292 / 390);overflow:hidden;padding:0 20px;background:var(--bg);font:15px/1.35 -apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;color:var(--text);--num:"Instrument Serif","New York",Georgia,serif}
.app::before{content:"";position:absolute;left:-100px;right:-100px;top:-180px;height:620px;background:radial-gradient(circle at 50% 0,var(--g) 0,transparent 62%);z-index:0}
.app>*{position:relative;z-index:1}
.app.glow-training{--g:var(--glow-training)}.app.glow-today{--g:var(--glow-today)}
.sb{display:flex;justify-content:space-between;align-items:center;height:54px;padding:6px 14px 0 18px;font-weight:600;font-size:16px}.sbi{display:flex;gap:6px}.sbi svg{height:12px;fill:currentColor}
.nav{display:flex;align-items:center;gap:12px;height:48px}.nav.c{justify-content:space-between}
.cb{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 20%,transparent);font-size:15px}
.nt b{display:block;font-size:17px}
.app .title{font-size:32px;margin:6px 0 4px}.app .sl+.title{margin-top:0}.nav .pill{height:32px;gap:5px;padding:0 12px}.nav .pill svg{width:13px;height:13px}.app .title2{font-size:34px;margin-top:6px}
.app .card{margin-top:10px;border-radius:22px;background:var(--panel);box-shadow:0 10px 15px -10px rgba(0,0,0,.08),0 1px 1px rgba(0,0,0,.04)}
.app .sl.pad2{margin:18px 0 0}.center{display:flex;justify-content:center}.center.col{flex-direction:column;align-items:center;margin-top:18px}
.gwrap{position:relative;width:190px;margin:4px auto 0}.gauge{display:block;height:auto}
.gauge circle{fill:none;stroke-width:14}.gt{stroke:var(--track);stroke-linecap:round}.gb{stroke:color-mix(in srgb,var(--green) 45%,transparent)}
.gs{stroke:var(--amber-bar);stroke-linecap:round;transition:stroke-dasharray 1.6s cubic-bezier(.16,1,.3,1)!important}
.js .gs[data-at]{opacity:1!important;transform:none!important}.js .gs:not(.in){stroke-dasharray:0.1 999!important}
.gc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.gc .g{font-size:54px;line-height:1}
.gl{display:flex;justify-content:space-between;width:150px;margin:-14px auto 0;font-size:11px;color:var(--muted)}
.split{padding:14px 16px!important}.sb2{display:flex;gap:2px;height:12px;border-radius:9px;background:var(--track);overflow:hidden}
.sb2 b{width:var(--w);transition:width .9s cubic-bezier(.16,1,.3,1)!important}.sb2 .w{background:var(--amber-bar)}.sb2 .m{background:color-mix(in srgb,var(--amber-bar) 50%,transparent)}.sb2 .p{border:1.5px dashed var(--amber-bar);border-radius:0 9px 9px 0}
.js .sb2 b{opacity:1!important;transform:none!important}.js .sb2 b:not(.in){width:0}
.leg{margin-top:8px;font-size:13px;color:var(--muted)}.leg b{color:var(--text);margin-left:6px}.leg b:first-child{margin-left:0}
.rows{padding:2px 16px!important}.rows .li{min-height:44px}
.made{padding:4px 16px!important}.made .mi{border:0}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0 6px}.grid3>div{display:flex;flex-direction:column}.tv{font-size:24px}
.rec{display:flex;align-items:center;gap:12px;padding:14px 16px!important}.sc{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--amber-soft);font-size:16px}.rec b{display:block}
.chg{padding:2px 16px!important}.chg .li{min-height:52px}.chg b{display:block;font-size:14.5px}
.hk{display:flex;align-items:center;gap:10px;padding:14px 16px!important}.hk b{flex:1}
.mf{display:flex;align-items:center;gap:12px;padding:10px 16px!important}.mf img{flex:none;width:34px;height:auto}.mf div{flex:1}.mf b{display:block}
.big2{height:50px;margin-top:14px}
.chat{display:flex;flex-direction:column}.chat .nav b{font-size:17px}
.msgs{flex:1;display:flex;flex-direction:column;gap:12px;padding:10px 0;justify-content:flex-start}
.msgs .u{align-self:flex-end;max-width:80%;padding:10px 14px;border-radius:18px;background:var(--button);color:var(--on-button);font-size:15.5px}
.msgs .c1{align-self:flex-start;max-width:86%;padding:12px 16px;border-radius:18px;background:var(--panel);font-size:15.5px;line-height:1.45}
.dots{align-self:flex-start;display:flex;align-items:center;gap:5px;padding:14px 16px;border-radius:18px;background:var(--panel)}.dots i{width:7px;height:7px;border-radius:50%;background:var(--text);animation:blink 1s infinite}.dots span{margin-left:7px;font-size:13px;color:var(--muted)}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes blink{50%{opacity:.25}}
.js .dots[data-at]:not(.in){display:none}
.act{align-self:stretch;padding:14px;border-radius:16px;background:color-mix(in srgb,var(--amber-soft) 60%,transparent)}
.al{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600}.an{font-size:22px;margin:6px 0 4px}
.ar2{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px}
.ab{display:flex;gap:8px;margin-top:10px}.ab span{display:grid;place-items:center;height:34px;padding:0 18px;border-radius:99px;font-size:13.5px;font-weight:600;transition:transform .2s}
.ab{flex-wrap:wrap}.ab .br{flex-basis:100%;height:0;margin-top:-2px}.ab .q{height:30px;padding:0 11px;font-size:12.5px;font-weight:500;background:var(--panel);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 10%,transparent)}
.ab .ok{background:var(--button);color:var(--on-button)}.ab .no{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 20%,transparent)}.ab .ok.press{transform:scale(.92)}
.ab.gone{display:none}.js .ab[data-at]:not(.gone){opacity:1;transform:none}.js .ab .ok[data-at]{opacity:1!important;transform:none!important}.js .ab .ok.press{transform:scale(.92)!important}
.conf{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;font-weight:500;color:var(--green)}
.js .conf:not(.in){display:none}
.inp{display:flex;align-items:center;gap:10px;padding:10px 0 34px}.inp .mut{flex:1;padding:12px 14px;border-radius:20px;background:var(--panel)}
.inp .cam{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--panel)}
.snd{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--button);color:var(--on-button)}
@media (prefers-reduced-motion:reduce){.cam .scan,.dots i,.btn .sp1{animation:none}}
/* The welcome's cards (ACTS): the app's paper cards with their soft shadow, rising into place. */
.dm.wc{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;width:100%}
.wcard{padding:14px 16px;border-radius:22px;background:var(--panel);box-shadow:0 1px 1px rgba(60,45,20,.05),0 16px 36px -12px rgba(60,45,20,.22)}
.wc .wait{transition:opacity .5s ease,transform .7s cubic-bezier(.34,1.3,.5,1)}.js .wc .wait:not(.in){transform:translateY(26px)}
.wc .w-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.wc .w-wr{align-items:flex-end;gap:14px;margin-top:2px}.wc .w-wr .num{font-size:96px;line-height:.92;min-width:108px}.wc .w-wr .sent{font-size:17px;line-height:1.3;padding-bottom:10px}
.wc em{font-style:italic}.wc .w-it{font-style:italic}
.wc .w-sm{display:flex;flex-direction:column;gap:2px}.wc .num.w-v{font-size:36px;line-height:1.1}.wc .num.w-v small{font-size:13px}
.w-s2{font-size:14px}.w-nt2{font-size:12.5px;font-weight:500}.amb2{color:var(--amber-bar)}
.js .wc .pop.wait:not(.in){transform:scale(.6)}
/* Training mode's sets: SETS · LAST TIME · KG · REPS, the rating oval and the tick square; the set at hand outlined. */
.wc .w-gym{padding:14px 10px 12px}.w-gh{padding:0 8px 8px;align-items:baseline}.w-gh b{font-family:Newsreader,"New York",Georgia,serif;font-size:24px;font-weight:400}
.w-row{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr) 56px 44px 34px 28px;align-items:center;gap:6px;height:44px;padding:0 8px;border-radius:12px;box-shadow:inset 0 0 0 1.5px transparent;transition:background .35s,box-shadow .35s}
.w-row.w-th{height:20px;font-size:10px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);opacity:.8}.w-th span:nth-child(3),.w-th span:nth-child(4){text-align:center}
.w-l{font-size:14px;font-weight:600;color:var(--sec)}.w-lt{font-size:13px;color:var(--muted);opacity:.7}
.w-f b{font-weight:400}.w-f{position:relative;display:grid;place-items:center;height:34px;border-radius:8px;font-size:22px;transition:background .35s}
.w-rate.w-m{display:grid;place-items:center;border:1.5px solid var(--indigo);font-size:11px;font-weight:700;font-style:normal;color:var(--text)}.w-rate{width:34px;height:22px;border-radius:99px;border:1.5px dashed color-mix(in srgb,var(--muted) 70%,transparent)}
.w-sq{position:relative;width:26px;height:26px;border-radius:8px;box-shadow:inset 0 0 0 1.5px var(--line);transition:box-shadow .35s}
.w-row:not(.w-now):not(.w-did) .w-l,.w-row:not(.w-now):not(.w-did) .w-f{color:var(--muted);opacity:.55}
.w-row.w-now{background:var(--track);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--amber) 55%,transparent)}
.w-now .w-l{color:var(--amber)}.w-now .w-f{background:var(--panel)}.w-now .w-sq{box-shadow:inset 0 0 0 1.5px var(--amber)}
.w-ok{position:absolute;inset:0;display:grid;place-items:center;border-radius:8px;background:var(--green);color:var(--on-button);font-size:14px;transition:transform .45s cubic-bezier(.34,1.6,.5,1),opacity .3s!important}.w-ok .di{stroke-width:2.6}.js .w-ok.wait:not(.in){transform:scale(.3)}
.w-go{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;height:46px;margin:12px 0 0;border-radius:99px;background:var(--button);color:var(--on-button);font-size:15px;font-weight:600}
/* The plate loader, slid up over the lower cards as in the app. */
.dm.wc.w-train{position:relative;overflow:hidden;width:calc(100% + 60px);margin:-30px -30px -64px;padding:30px 30px 64px}
.w-loader{position:absolute;left:30px;right:30px;top:30px;bottom:64px;z-index:3;display:flex;flex-direction:column;justify-content:center;padding:14px 18px 18px;border-radius:22px;background:var(--bg);box-shadow:0 -14px 40px -14px rgba(60,45,20,.35);transform:translateY(calc(100% + 64px));transition:transform .6s cubic-bezier(.2,.9,.25,1)!important}
.js .w-loader.wait:not(.in){opacity:1;transform:translateY(calc(100% + 64px))}.w-loader.in{transform:none}
.w-sh{font-size:14px}.w-sh b{position:relative;font-weight:600}
.w-big{display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:6px}.w-big .num{font-size:54px;line-height:1}.w-big .mut{font-size:18px;font-weight:500}
.w-sum{text-align:center;margin-top:2px}
/* The bar from the side, as PlateLoader.swift lays it out: the bar's end, the collar, then the plates two points apart. */
.w-barbell{position:relative;display:flex;align-items:center;gap:2px;height:100px;margin:10px -18px 0;overflow:hidden}
.w-barbell .w-rod{position:absolute;left:56px;right:12px;top:50%;height:12px;margin-top:-6px;border-radius:4px;background:var(--metal)}
.w-barbell .w-end{position:relative;flex:none;width:52px;height:13px;border-radius:0 4px 4px 0;display:grid;place-items:center;font-size:9.5px;font-weight:600;color:#fff;background:var(--plate-1-25);box-shadow:inset 0 0 0 1.2px var(--plate-1-25-line)}
.w-barbell .w-collar{position:relative;flex:none;width:8px;height:24px;border-radius:2px;background:var(--metal)}
.w-plate{position:relative;flex:none;display:grid;place-items:center;border-radius:5px;color:#fff;font-size:10px;font-weight:600;background:var(--c);box-shadow:inset 0 0 0 1.2px var(--l);transition:transform .55s cubic-bezier(.34,1.4,.5,1),opacity .35s!important}
.w-plate.w-p25{width:21px;height:92px;--c:var(--plate-25);--l:var(--plate-25-line)}
.w-plate.w-p5{width:19px;height:62px;--c:var(--plate-5);--l:var(--plate-5-line)}
.w-plate.w-p2-5{width:18px;height:53px;font-size:8.5px;--c:var(--plate-2-5);--l:var(--plate-2-5-line)}
.js .w-plate.wait:not(.in){opacity:0;transform:translateX(160px)}
.w-addl{margin-top:6px;font-weight:600}
.w-discs{display:flex;justify-content:space-between;margin-top:8px}
.w-disc{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;color:#fff;font-size:11px;font-weight:600;background:var(--c);box-shadow:inset 0 0 0 1.2px var(--l)}
.w-disc.w-p25{--c:var(--plate-25);--l:var(--plate-25-line)}.w-disc.w-p20{--c:var(--plate-20);--l:var(--plate-20-line)}.w-disc.w-p15{--c:var(--plate-15);--l:var(--plate-15-line)}
.w-disc.w-p10{--c:var(--plate-10);--l:var(--plate-10-line)}.w-disc.w-p5{--c:var(--plate-5);--l:var(--plate-5-line)}.w-disc.w-p2-5{--c:var(--plate-2-5);--l:var(--plate-2-5-line)}.w-disc.w-p1-25{--c:var(--plate-1-25);--l:var(--plate-1-25-line);font-size:9.5px}
.w-disc b{position:absolute;right:-6px;top:-6px;min-width:19px;height:19px;padding:0 4px;border-radius:99px;display:grid;place-items:center;font-size:10px;font-weight:600;color:var(--on-button);background:var(--button);transition:transform .35s cubic-bezier(.34,1.6,.5,1),opacity .2s!important}
.js .w-disc b.wait:not(.in){opacity:0;transform:scale(.4)}
/* Where a finger taps: a soft ring that comes and goes. */
.w-tap{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;pointer-events:none;background:color-mix(in srgb,var(--text) 14%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--text) 22%,transparent);transition:opacity .2s,transform .3s cubic-bezier(.34,1.6,.5,1)!important}
.js .wc .w-tap.wait:not(.in),.w-tap:not(.in){opacity:0;transform:scale(.5)}
.wc .w-meal{position:relative;padding-top:20px}.w-mr{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:12px;align-items:start}.w-mh{gap:6px}.w-mh b{font-size:16px;font-weight:600}.w-mh .md{margin-left:auto}.w-ft{color:var(--muted);opacity:.85}.num.w-ft{font-size:14px}.w-plus{display:grid;place-items:center;width:32px;height:32px;margin-top:2px;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 20%,transparent);font-size:14px}.w-plus .di{stroke-width:2.6}.wc .w-badge{position:absolute;left:12px;top:-12px;gap:5px;transform-origin:left}
.w-mac{display:grid;grid-template-columns:76px 1fr 74px;align-items:center;gap:10px;margin:6px 0}.w-mac .s{text-align:right}.w-mac>.s:first-child{text-align:left;display:flex;align-items:center;gap:6px}.w-mac i:not(.bar){width:6px;height:6px;border-radius:50%}
.w-mac .bar{height:5px}.wc .w-mr>div>.mut:last-child{display:block;margin-top:4px}
.wc .w-scan,.wc .w-drink{display:flex;flex-direction:column;gap:8px;min-height:164px}
.w-code{position:relative;flex:1;display:flex;align-items:center;justify-content:center;gap:2px;border-radius:14px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.w-code>i{height:44px;background:var(--text)}
.w-code .w-corners{position:absolute;inset:8px;transition:transform .5s cubic-bezier(.34,1.4,.5,1),opacity .3s!important;background:
 linear-gradient(var(--amber-bar),var(--amber-bar)) 0 0/18px 3px,linear-gradient(var(--amber-bar),var(--amber-bar)) 0 0/3px 18px,
 linear-gradient(var(--amber-bar),var(--amber-bar)) 100% 0/18px 3px,linear-gradient(var(--amber-bar),var(--amber-bar)) 100% 0/3px 18px,
 linear-gradient(var(--amber-bar),var(--amber-bar)) 0 100%/18px 3px,linear-gradient(var(--amber-bar),var(--amber-bar)) 0 100%/3px 18px,
 linear-gradient(var(--amber-bar),var(--amber-bar)) 100% 100%/18px 3px,linear-gradient(var(--amber-bar),var(--amber-bar)) 100% 100%/3px 18px;background-repeat:no-repeat;border-radius:8px}
.js .w-code .w-corners.wait:not(.in){transform:scale(1.25)}
.w-code .w-beam{position:absolute;left:16px;right:16px;top:50%;height:2px;border-radius:2px;background:var(--sun);box-shadow:0 0 10px var(--sun)}
.opener.on .w-code .w-beam{animation:scanbeam 2.85s ease-in-out infinite}
@keyframes scanbeam{0%,100%{transform:translateY(-26px)}50%{transform:translateY(26px)}}
.w-drink .w-dot{width:8px;height:8px;border-radius:50%;background:var(--blue)}.w-drink .w-s2{gap:6px;font-weight:500}
.w-whale{display:block;width:84px;height:84px;margin:0 auto}.w-whale .w-water{transform:translateY(92px);transition:transform 1.6s ease-in-out!important}
.w-whale .w-water.in{transform:translateY(56px)}.w-whale .w-water.full,html:not(.js) .w-whale .w-water{transform:translateY(30px)}
/* The goal reached: the whale blows its spout (DrinkFigure.swift), bobbing a little. */
.w-spout{transform-origin:48px 32px;transition:transform .5s cubic-bezier(.34,1.6,.5,1),opacity .3s!important;animation:w-blow 1.6s ease-in-out infinite}.js .w-spout.wait:not(.in){opacity:0;transform:scale(.2)}
@keyframes w-blow{50%{translate:0 -1.5px}}@media (prefers-reduced-motion:reduce){.w-spout{animation:none}}.js .w-whale .w-water.wait:not(.in){opacity:1}
.w-wv{animation:w-wave 3s linear infinite}.w-wv2{animation-duration:4.4s}@keyframes w-wave{to{transform:translateX(-55px)}}.w-wv2{animation-name:w-wave2}@keyframes w-wave2{from{transform:translate(0,6px)}to{transform:translate(-36.67px,6px)}}
@media (prefers-reduced-motion:reduce){.w-wv{animation:none}}
.w-drink .row.base{flex-wrap:wrap;column-gap:6px}.w-drink .row.base .mut{white-space:nowrap}
/* Drinks: the card in Výživa with the whale (DrinkFigure.swift), its colours in light and dark. */
.dk{--wt:#4FA3D9;--wd:rgba(46,134,193,.35);--we:#EAF3F9;--wi:#1B4F72;--wf:#1B1A17;--wb:#F28AA0}
@media (prefers-color-scheme:dark){.dk{--wt:#3C8FCB;--wd:rgba(42,116,168,.45);--we:#1D2932;--wi:#8CC4EA;--wf:#101010;--wb:#F59BB0}}
.dk-h{gap:8px;font-weight:600}.dk-dot{width:9px;height:9px;border-radius:50%;background:var(--blue)}
.dk-plus{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--blue);color:var(--on-button,#fff)}.dk-plus .di{width:16px;height:16px;stroke-width:2.6}
.dk-r{gap:16px;margin-top:10px;align-items:center}.dk-fig{position:relative;flex:none;width:112px;height:112px}
.dk-amt{gap:6px}.dk-of{font-size:20px;color:var(--faint,var(--muted))}.dk-pc{color:var(--blue);font-weight:600;font-size:13px;margin:4px 0 2px}
.dk-toast{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:11px 14px;border-radius:14px;background:color-mix(in srgb,var(--blue) 14%,transparent);font-size:14px;max-height:60px;overflow:hidden;transition:opacity .2s,max-height .25s,margin .25s,padding .25s!important}
.dk-toast b{color:var(--blue)}.dk-t{display:flex;align-items:center;gap:8px}.dk-t .di{width:15px;height:15px;color:var(--blue);stroke-width:2.6}
.js .dk-toast.wait:not(.in){opacity:0;max-height:0;margin-top:0;padding-block:0}
.dk-chips{display:flex;gap:8px;margin-top:12px}
.dk-chip{position:relative;display:flex;align-items:center;gap:8px;height:48px;padding:0 14px 0 12px;border-radius:14px;background:color-mix(in srgb,var(--blue) 10%,transparent);transition:transform .15s!important}
.dk-chip>span:last-of-type{display:flex;flex-direction:column;font-size:13px;line-height:1.2}.dk-chip .mut{font-size:11px;font-weight:500}
.dk-chip.press{transform:scale(.95)}.dk-ic{display:grid;width:18px;color:var(--blue)}.dk-ic .di{grid-area:1/1;width:16px;height:16px;transition:opacity .2s!important}
.dk-ic .dk-ok{stroke-width:2.6;opacity:0}.dk-chip.ok .dk-ok{opacity:1}.dk-chip.ok .dk-ic .di:first-child{opacity:0}
.dw{display:block;width:112px;height:112px;overflow:visible;transform-origin:50% 70%;transition:transform .15s!important}
.dw.press{transform:scale(.94)}.js .dw.goal{animation:dw-pop .7s cubic-bezier(.34,1.6,.5,1)}@keyframes dw-pop{35%{transform:scale(1.12)}}
.dw-empty{fill:var(--we)}.dw-f1{fill:var(--wt)}.dw-f2{fill:var(--wd)}
.dw-w{transform:translateY(56px);transition:transform 1s ease-in-out!important}.dw-w.a{transform:translateY(44px)}.dw-w.b{transform:translateY(32.5px)}.dw-w.c,html:not(.js) .dw-w{transform:translateY(30px)}
.js .dw-w.wait:not(.in){opacity:1}
.dw-ink{fill:none;stroke:var(--wi);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.dw-thin{stroke-width:2}.dw-face{fill:var(--wf)}
.dw-lid{fill:none;stroke:var(--wf);stroke-width:2.4;stroke-linecap:round}.dw-blush{fill:var(--wb);opacity:.45}
.dw-happy,.dw.goal .dw-eye{opacity:0}.dw.goal .dw-happy{opacity:1}.dw-eye,.dw-happy{transition:opacity .2s!important}
.dw-drop{fill:var(--wt);opacity:0}.js .dw-drop.in{animation:dw-fall .45s ease-in forwards}@keyframes dw-fall{from{opacity:1;transform:translate(48px,-14px) scale(1.5)}90%{opacity:1}to{opacity:0;transform:translate(48px,32px) scale(1.5)}}
.dw-ring{fill:none;stroke:#fff;stroke-width:1.6;opacity:0;transform-origin:48px 31px}.js .dw-ring.in{animation:dw-ring .7s ease-out forwards}@keyframes dw-ring{from{opacity:.9;transform:scale(.6)}to{opacity:0;transform:scale(3.2,2.4)}}
.dw-spout{fill:var(--wt);transform-origin:48px 32px;transition:transform .6s cubic-bezier(.34,1.6,.5,1),opacity .3s!important;animation:w-blow 1.6s ease-in-out infinite}.dw-spout path{fill:none;stroke:var(--wt);stroke-width:3;stroke-linecap:round}
.js .dw-spout.wait:not(.in),html:not(.js) .dw-burst{opacity:0;transform:scale(.2)}
.dw-burst path{fill:var(--wt);opacity:0;transform:translate(48px,8px)}.js .dw-burst.in path{animation:dw-fly 1.6s cubic-bezier(.2,.7,.4,1) var(--d) infinite}
@keyframes dw-fly{0%{opacity:0;transform:translate(48px,10px) scale(1.1)}12%{opacity:1}40%{transform:translate(calc(48px + var(--x) * .6),calc(10px + var(--y))) scale(1)}75%{opacity:.8}100%{opacity:0;transform:translate(calc(48px + var(--x)),34px) scale(.6)}}
/* Apple Watch: the case and its dark screens (WatchStyle.swift: Instrument Serif numbers, a glow at the top). */
.aw-w{position:relative;width:236px;height:286px;border-radius:62px;padding:12px;background:linear-gradient(145deg,#3b3d41,#1c1d1f);box-shadow:0 30px 60px -24px rgba(40,30,10,.55),inset 0 0 0 1.5px #55585d}
.aw-w:after{content:"";position:absolute;right:-7px;top:62px;width:9px;height:40px;border-radius:5px;background:linear-gradient(90deg,#2a2b2e,#4a4c50)}
.aw-w:before{content:"";position:absolute;right:-5px;top:120px;width:6px;height:46px;border-radius:3px;background:#2e2f32}
.aw-s{position:relative;height:100%;border-radius:50px;overflow:hidden;padding:14px 15px 12px;background:radial-gradient(120% 60% at 50% -5%,var(--gw,#000) 0,#000 70%);color:#ECEAE6;font:12px/1.3 -apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;text-align:left}
.aw-s .di{width:14px;height:14px}
.aw-top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:26px}.aw-top>span:last-child{justify-self:end}
.aw-time{font-weight:600;font-size:14px}
.aw-ib{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.12)}.aw-ib .di{stroke-width:2.4}
.aw-ib.aw-sm{width:22px;height:22px}.aw-ib.aw-sm .di{width:11px;height:11px;stroke-width:3}
.aw-n{font-family:"Instrument Serif","New York",Georgia,serif;font-weight:400;line-height:1}
.aw-k{color:#9AA39F;font-size:11px}
.aw-hero{display:flex;align-items:flex-end;gap:7px;margin-top:-2px}.aw-hero .aw-n{line-height:.95}
.aw-side{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin-bottom:7px}.aw-side .aw-k{color:#D9D6D0;font-size:12px}
.aw-pill{padding:2px 8px;border-radius:99px;background:rgba(143,230,196,.16);font-size:11px;font-weight:600}
.aw-g{display:flex;margin-top:6px;border-radius:14px;background:rgba(255,255,255,.08)}.aw-g>div{flex:1;display:flex;flex-direction:column;padding:6px 6px 6px 7px}.aw-g>div+div{border-left:1px solid rgba(255,255,255,.1)}
.aw-v{font-size:19px;line-height:1.1}.aw-v small{font:10px -apple-system,Inter,sans-serif;color:#9AA39F;margin-left:2px}.aw-g b{font-size:10px}
.aw-rb{position:relative;display:block;height:4px;margin:4px 0 3px;border-radius:2px;background:#2A2C2E}.aw-rb:before{content:"";position:absolute;left:33%;width:34%;top:0;bottom:0;background:rgba(255,255,255,.18)}
.aw-rb b{position:absolute;top:-2px;width:8px;height:8px;margin-left:-4px;border-radius:50%;border:1.5px solid #000}
.aw-next{display:flex;align-items:center;gap:5px;margin-top:7px;font-size:10.5px;font-weight:600;white-space:nowrap}
.aw-ex{display:flex;align-items:center;justify-content:space-between;margin-top:4px}.aw-ex b{font-size:16px}.aw-ex>span{display:flex;align-items:center;gap:5px;font-weight:500}
.aw-two{display:flex;gap:6px;margin-top:6px}.aw-two>div{flex:1}
.aw-box{display:flex;flex-direction:column;align-items:center;padding:4px 0 3px;border-radius:13px;background:rgba(255,255,255,.08)}.aw-box .aw-n{font-size:34px}
.aw-box.on{background:#16352B;box-shadow:inset 0 0 0 2px #8FE6C4}
.aw-done{display:grid;place-items:center;height:34px;margin-top:7px;border-radius:17px;background:#F4F2EE;color:#0A0B0C;font-size:14px;font-weight:700}
.aw-tiles>div{padding:5px 9px;border-radius:12px;background:rgba(255,255,255,.07)}.aw-tiles b{display:block;font-size:17px}.aw-tiles small{font-size:10px}
.aw-rest{position:relative;display:grid;place-items:center;width:150px;height:150px;margin:4px auto 0}.aw-rest svg{position:absolute;inset:0;fill:none}.aw-rest .aw-n{font-size:40px}
.aw-c{margin-top:6px;text-align:center;font-weight:500}
.aw-ring{position:relative;display:grid;place-items:center;flex:none}.aw-ring>svg{position:absolute;inset:0;fill:none}
.aw-in{display:flex;flex-direction:column;align-items:center;line-height:1}.aw-in small{font-size:7.5px;color:#9AA39F;margin-top:2px}
.aw-food{display:flex;align-items:center;gap:9px;margin-top:2px}.aw-food .aw-in .aw-n{font-size:16px}.aw-food>div{display:flex;flex-direction:column}
.aw-news{font-family:Newsreader,Georgia,serif;font-size:16px;line-height:1.15;white-space:nowrap}
.aw-mac{display:flex;gap:7px;margin-top:4px;font-size:10.5px}.aw-mac>div{flex:1}.aw-mac b{display:block}
.aw-mac i,.aw-water i{display:block;height:3px;margin-top:2px;border-radius:2px;background:#2A2C2E}.aw-mac i b,.aw-water i b{display:block;height:100%;border-radius:2px;background:#7CC3F0}
.aw-water{display:flex;align-items:center;gap:7px;margin-top:8px;padding:6px 6px 6px 10px;border-radius:14px;background:#141618}.aw-water>div{flex:1;font-size:13px}
.aw-plus{padding:6px 10px;border-radius:99px;background:#7CC3F0;color:#000;font-size:13px;font-weight:700}
.aw-face{background:#000}.aw-date{float:right;display:flex;flex-direction:column;align-items:center;justify-content:center;width:48px;height:48px;margin-top:4px;border-radius:50%;background:#1c1d1f;color:#FF6B5B;font-size:9px;font-weight:600}.aw-date b{color:#fff;font-size:17px}
.aw-clock{clear:both;margin-top:2px;text-align:center;font-size:58px;font-weight:600;line-height:1;letter-spacing:-1px}
.aw-comps{display:flex;justify-content:center;gap:9px;margin-top:12px}.aw-comps .aw-in .di{width:11px;height:11px}.aw-comps .aw-in b{color:#fff;font-size:15px;font-weight:700}
@media (prefers-reduced-motion:reduce){.dw-spout,.js .dw.goal,.js .dw-burst.in path,.js .dw-drop.in,.js .dw-ring.in{animation:none}.dw-drop,.dw-ring{display:none}}
.wc .th .di{font-size:12px}.wc .chips3 .ch3{border-radius:16px;transition:background .35s,border-color .35s}.wc .ch3 b{font-weight:600;font-size:15px}
.wc .hg{margin-bottom:0}.hgt.w-draw{transition:clip-path 1.6s ease-in-out!important;clip-path:inset(0 0 0 0)}.js .hgt.w-draw.wait:not(.in){opacity:1;transform:none;clip-path:inset(0 100% 0 0)}
.coach2{gap:12px}.coach2 .w-q{justify-self:end;padding:10px 14px;border-radius:18px;background:var(--button);color:var(--on-button);font-size:16px}
.coach2 .dots{box-shadow:0 16px 36px -12px rgba(60,45,20,.22)}.coach2 .dots:not(.in){display:none}html:not(.js) .coach2 .dots{display:none}
.coach2 .w-a{margin-right:30px}.coach2 .w-a .sent{font-size:18px;line-height:1.35}
.coach2 .w-wo{gap:12px;padding:12px}.coach2 .w-wo .ib{width:40px;height:40px;border-radius:12px;font-size:21px}.coach2 .w-wo>div{flex:1;display:flex;flex-direction:column}
.coach2 .w-add{display:inline-flex;align-items:center;height:34px;padding:0 16px;border-radius:99px;background:var(--button);color:var(--on-button);font-size:13px;font-weight:600}
@media (prefers-reduced-motion:reduce){.opener.on .w-code .w-beam{animation:none}}
`;

// The player: AurinDemo.play(el) runs the timeline of every demo inside el from the start, stop(el) clears it,
// last(el) shows its last frame (reduced motion, or a step shown without its turn).
export const demoScript = `<script>(function(){
var T=new WeakMap();
function fmt(v,f){if(f==='i')return Math.round(v).toLocaleString('en-US');if(f==='1')return v.toFixed(1);
 if(f==='ms'){v=Math.max(0,Math.round(v));return Math.floor(v/60)+':'+('0'+v%60).slice(-2);}
 if(f==='hm'){v=Math.round(v);return Math.floor(v/60)+' h'+(v%60?' '+v%60+' min':'');}
 if(f==='hmc'){v=Math.round(v);return Math.floor(v/60)+':'+('0'+v%60).slice(-2);}return String(v);}
function clock(m){m=((Math.round(m)%1440)+1440)%1440;var h=Math.floor(m/60),am=h<12;h=h%12||12;return h+':'+('0'+m%60).slice(-2)+(am?' AM':' PM');}
function specs(s){return (s||'').split(';').filter(Boolean).map(function(x){return x.split(',');});}
function prep(root){if(root._prep)return;root._prep=true;
 root.querySelectorAll('[data-at]').forEach(function(el){
  if(el.dataset.at.split(' ').some(function(t){return /^\\d+$/.test(t)||/:in$/.test(t);}))el.classList.add('wait');el._c0=el.getAttribute('class')||'';});
 root.querySelectorAll('[data-type]').forEach(function(el){el._full=el.textContent;});}
function first(root){
 root.querySelectorAll('[data-at]').forEach(function(el){el.setAttribute('class',el._c0);});
 root.querySelectorAll('[data-tx]').forEach(function(el){el.textContent=el.dataset.tx.split(';')[0].split('|')[1];});
 root.querySelectorAll('[data-n]').forEach(function(el){var s=specs(el.dataset.n)[0];el.textContent=fmt(+s[0],s[4]);});
 root.querySelectorAll('[data-type]').forEach(function(el){el.textContent='';});
 root.querySelectorAll('[data-ring]').forEach(function(el){var s=specs(el.dataset.ring)[0],c=+el.getAttribute('stroke-dasharray');el.style.strokeDashoffset=c*(1-s[0]/s[4]);});
 root.querySelectorAll('.dial').forEach(function(d){var k=d.dataset.dial.split(' ')[0].split(':');dial(d,+k[1],+k[2]);});}
// What each element looks like once its timeline is over.
function end(root){
 root.querySelectorAll('[data-at]').forEach(function(el){el.setAttribute('class',el._c0);
  el.dataset.at.split(' ').map(parse).sort(function(a,b){return a.t-b.t;}).forEach(function(x){apply(el,x);});});
 root.querySelectorAll('[data-tx]').forEach(function(el){var l=el.dataset.tx.split(';');el.textContent=l[l.length-1].split('|')[1];});
 root.querySelectorAll('[data-n]').forEach(function(el){var l=specs(el.dataset.n),s=l[l.length-1];el.textContent=fmt(+s[1],s[4]);});
 root.querySelectorAll('[data-type]').forEach(function(el){el.textContent=el._full;});
 root.querySelectorAll('[data-ring]').forEach(function(el){var l=specs(el.dataset.ring),s=l[l.length-1],c=+el.getAttribute('stroke-dasharray');el.style.strokeDashoffset=c*(1-s[1]/s[4]);});
 root.querySelectorAll('.dial').forEach(function(d){dial(d,+d.dataset.wake,+d.dataset.sleep);});}
function parse(tok){var m=/^(\\d+)(?:([:-])([\\w-]+))?$/.exec(tok)||[0,0];return {t:+m[1],op:m[2]||':',c:m[3]||'in'};}
function apply(el,x){el.classList[x.op==='-'?'remove':'add'](x.c);}
function stop(root){var s=T.get(root);if(s){s.t.forEach(clearTimeout);s.r.forEach(cancelAnimationFrame);s.on=false;}T.set(root,{t:[],r:[],on:false});}
function last(root){prep(root);stop(root);end(root);}
function play(root){prep(root);stop(root);first(root);var s=T.get(root);s.on=true;var t0=performance.now();
 function later(ms,fn){s.t.push(setTimeout(fn,ms));}
 function tween(from,to,start,len,fn){later(start,function(){var a=performance.now();(function step(){if(!s.on)return;var k=Math.min(1,(performance.now()-a)/len),e=k<1&&len>1500?k:1-Math.pow(1-k,3);fn(from+(to-from)*(len>1500?k:e));if(k<1)s.r.push(requestAnimationFrame(step));})();});}
 root.querySelectorAll('[data-at]').forEach(function(el){el.dataset.at.split(' ').map(parse).forEach(function(x){later(x.t,function(){apply(el,x);});});});
 root.querySelectorAll('[data-tx]').forEach(function(el){el.dataset.tx.split(';').forEach(function(p){var q=p.split('|');later(+q[0],function(){el.textContent=q[1];});});});
 root.querySelectorAll('[data-n]').forEach(function(el){specs(el.dataset.n).forEach(function(q){tween(+q[0],+q[1],+q[2],+q[3],function(v){el.textContent=fmt(v,q[4]);});});});
 root.querySelectorAll('[data-type]').forEach(function(el){var q=el.dataset.type.split(','),full=el._full;tween(0,full.length,+q[0],+q[1],function(v){el.textContent=full.slice(0,Math.round(v));});});
 root.querySelectorAll('[data-ring]').forEach(function(el){var c=+el.getAttribute('stroke-dasharray');specs(el.dataset.ring).forEach(function(q){tween(+q[0],+q[1],+q[2],+q[3],function(v){el.style.strokeDashoffset=c*(1-v/q[4]);});});});
 root.querySelectorAll('.dial').forEach(function(d){if(d._touched)return;var ks=d.dataset.dial.split(' ').map(function(k){return k.split(':').map(Number);});
  for(var i=1;i<ks.length;i++)(function(a,b){tween(0,1,a[0],b[0]-a[0],function(k){if(!d._touched)dial(d,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k);});})(ks[i-1],ks[i]);});}
// The bedtime dial (SleepPlanner.swift SleepDial): 24 h with midnight on top; in bed = sleep ÷ 93.6 % efficiency.
function r5(m){return Math.round(m/5)*5;}
function pt(m,r){var a=m/1440*2*Math.PI;return [150+r*Math.sin(a),150-r*Math.cos(a)];}
function dial(d,wake,sleep){wake=((wake%1440)+1440)%1440;d.dataset.wake=Math.round(wake);d.dataset.sleep=Math.round(sleep);
 var bed=wake-r5(sleep/.936),a=pt(bed,126),b=pt(wake,126),span=((wake-bed)%1440+1440)%1440,box=d.closest('.dm');
 d.querySelector('.arc').setAttribute('d','M'+a[0].toFixed(1)+' '+a[1].toFixed(1)+'A126 126 0 '+(span>720?1:0)+' 1 '+b[0].toFixed(1)+' '+b[1].toFixed(1));
 var w=250/300;[['.moon',a],['.sun',b]].forEach(function(h){var el=d.querySelector(h[0]);el.style.transform='translate('+(h[1][0]*w).toFixed(1)+'px,'+(h[1][1]*w).toFixed(1)+'px)';});
 var s=r5(sleep);d.querySelector('.len').textContent=fmt(s,'hmc');box.querySelector('.bed').textContent=clock(bed);box.querySelector('.wake').textContent=clock(wake);
 var mo=d.querySelector('.moon'),su=d.querySelector('.sun'),tl=fmt(s,'hm');
 mo.setAttribute('aria-valuenow',((Math.round(bed)%1440)+1440)%1440);mo.setAttribute('aria-valuetext','Bedtime '+clock(bed)+', '+tl+' of sleep');
 su.setAttribute('aria-valuenow',Math.round(wake));su.setAttribute('aria-valuetext','Wake up '+clock(wake)+', '+tl+' of sleep');}
function minutesAt(d,e){var r=d.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,a=Math.atan2(x,-y);return r5(((a/(2*Math.PI))*1440+1440)%1440);}
function setFrom(d,h,m){var wake=+d.dataset.wake,sleep=+d.dataset.sleep;
 if(h.classList.contains('sun'))dial(d,m,sleep);else{var inBed=((wake-m)%1440+1440)%1440;dial(d,wake,Math.min(720,Math.max(300,r5(inBed*.936))));}}
function touched(d){d._touched=true;d.dispatchEvent(new CustomEvent('demo:touch',{bubbles:true}));}
document.querySelectorAll('.dial').forEach(function(d){dial(d,+d.dataset.wake,+d.dataset.sleep);
 d.querySelectorAll('.hd').forEach(function(h){
  h.addEventListener('pointerdown',function(e){e.preventDefault();h.setPointerCapture(e.pointerId);touched(d);h._drag=true;});
  h.addEventListener('pointermove',function(e){if(h._drag)setFrom(d,h,minutesAt(d,e));});
  h.addEventListener('pointerup',function(){h._drag=false;});
  h.addEventListener('keydown',function(e){var k=e.key==='ArrowRight'||e.key==='ArrowUp'?5:e.key==='ArrowLeft'||e.key==='ArrowDown'?-5:0;if(!k)return;e.preventDefault();touched(d);
   var base=h.classList.contains('sun')?+d.dataset.wake:+d.dataset.wake-r5(+d.dataset.sleep/.936);setFrom(d,h,base+k);});});});
window.AurinDemo={play:play,stop:stop,last:last,first:function(r){prep(r);stop(r);first(r);}};})();</script>`;
