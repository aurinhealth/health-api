import { FOCUS_GROUPS } from './strength-generator.js';

const region = (id, path) => `<path class="gym-muscle" data-muscle="${id}" role="button" tabindex="0" aria-pressed="false" aria-label="${FOCUS_GROUPS[id].label}" d="${path}"/>`;

function figure(side, regions) {
  const detail = side === 'front'
    ? `<path class="gym-anatomy" d="M76 18 Q90 13 104 18 M75 29 Q73 35 76 37 M105 29 Q107 35 104 37 M82 40 Q90 44 98 40 M79 48 Q90 56 101 48 M72 59 Q79 62 85 67 M108 59 Q101 62 95 67 M69 88 Q79 95 89 94 M111 88 Q101 95 91 94 M90 99 L90 164 M75 105 Q81 109 88 107 M92 107 Q99 109 105 105 M76 118 Q82 122 88 120 M92 120 Q98 122 104 118 M77 131 Q83 135 88 133 M92 133 Q97 135 103 131 M79 145 Q84 149 88 147 M92 147 Q96 149 101 145 M58 91 Q52 98 50 109 M122 91 Q128 98 130 109 M70 176 Q81 186 87 202 M110 176 Q99 186 93 202 M76 216 Q82 229 84 249 M104 216 Q98 229 96 249 M71 280 Q79 290 80 303 M109 280 Q101 290 100 303"/>`
    : `<path class="gym-anatomy" d="M80 14 Q90 11 100 14 M79 48 Q90 54 101 48 M68 61 Q78 67 87 78 M112 61 Q102 67 93 78 M69 86 Q80 91 87 109 M111 86 Q100 91 93 109 M90 73 L90 166 M74 112 Q82 117 88 123 M106 112 Q98 117 92 123 M75 145 Q84 150 90 154 Q96 150 105 145 M56 91 Q52 102 51 114 M124 91 Q128 102 129 114 M71 182 Q81 190 89 200 M109 182 Q99 190 91 200 M75 217 Q81 232 83 251 M105 217 Q99 232 97 251 M73 280 Q78 291 80 306 M107 280 Q102 291 100 306"/>`;
  return `<div class="gym-figure${side === 'front' ? ' active' : ''}" data-side="${side}"><span>${side === 'front' ? 'Zepředu' : 'Zezadu'}</span><svg viewBox="0 0 180 326" aria-label="Partie ${side === 'front' ? 'zepředu' : 'zezadu'}">
    <path class="gym-body" d="M90 6 C78 6 72 16 73 29 C74 43 81 51 90 52 C99 51 106 43 107 29 C108 16 102 6 90 6 Z"/>
    <path class="gym-body" d="M79 45 Q79 53 70 56 Q57 57 53 69 Q49 79 52 91 L60 132 Q66 148 69 165 L68 187 Q69 202 77 207 L90 211 L103 207 Q111 202 112 187 L111 165 Q114 148 120 132 L128 91 Q131 79 127 69 Q123 57 110 56 Q101 53 101 45 Z"/>
    <path class="gym-body" d="M54 65 Q47 70 46 84 L41 111 Q40 119 37 133 L31 156 Q29 165 34 170 L39 171 Q43 168 44 162 L52 139 Q55 129 57 115 L64 82 Z M126 65 Q133 70 134 84 L139 111 Q140 119 143 133 L149 156 Q151 165 146 170 L141 171 Q137 168 136 162 L128 139 Q125 129 123 115 L116 82 Z"/>
    <path class="gym-body" d="M69 186 Q65 204 67 224 L68 259 Q68 267 70 277 L71 307 Q69 316 72 319 L84 319 Q87 316 86 310 L88 274 Q89 263 89 254 L90 213 Q84 202 78 190 Z M111 186 Q115 204 113 224 L112 259 Q112 267 110 277 L109 307 Q111 316 108 319 L96 319 Q93 316 94 310 L92 274 Q91 263 91 254 L90 213 Q96 202 102 190 Z"/>
    ${regions}
    ${detail}
  </svg></div>`;
}

const front = [
  region('front_delts', 'M71 58 Q66 60 62 67 Q61 75 65 81 L72 66 Z M109 58 Q114 60 118 67 Q119 75 115 81 L108 66 Z'),
  region('side_delts', 'M65 56 Q55 56 52 68 Q50 77 54 88 Q60 86 63 78 Q59 68 69 59 Z M115 56 Q125 56 128 68 Q130 77 126 88 Q120 86 117 78 Q121 68 111 59 Z'),
  region('chest', 'M72 65 Q80 62 89 67 L89 94 Q80 95 67 88 Q64 80 68 70 Z M91 67 Q100 62 108 65 L112 70 Q116 80 113 88 Q100 95 91 94 Z'),
  region('biceps', 'M52 87 Q57 88 61 83 L59 102 Q57 113 51 119 L45 116 Q47 98 52 87 Z M128 87 Q123 88 119 83 L121 102 Q123 113 129 119 L135 116 Q133 98 128 87 Z'),
  region('forearms', 'M45 119 Q51 122 56 117 L54 134 Q50 147 45 160 L35 158 Q38 139 45 119 Z M135 119 Q129 122 124 117 L126 134 Q130 147 135 160 L145 158 Q142 139 135 119 Z'),
  region('obliques', 'M68 95 Q73 98 77 100 L79 129 76 158 71 163 Q74 143 71 125 Z M112 95 Q107 98 103 100 L101 129 104 158 109 163 Q106 143 109 125 Z'),
  region('abs', 'M79 98 Q90 100 101 98 L101 126 103 158 Q97 167 90 169 Q83 167 77 158 L79 126 Z'),
  region('hips', 'M70 170 Q80 175 90 174 Q100 175 110 170 L112 190 Q108 201 101 207 L92 211 L90 197 L88 211 L79 207 Q72 201 68 190 Z'),
  region('quads', 'M68 208 Q76 211 87 214 L88 248 Q86 260 82 269 L70 267 Q66 242 68 208 Z M112 208 Q104 211 93 214 L92 248 Q94 260 98 269 L110 267 Q114 242 112 208 Z'),
  region('calves', 'M70 277 Q77 280 85 275 L84 306 L72 308 Q70 295 70 277 Z M110 277 Q103 280 95 275 L96 306 L108 308 Q110 295 110 277 Z')
].join('');

const back = [
  region('rear_delts', 'M66 56 Q55 56 52 68 Q50 77 54 88 Q61 86 67 77 L74 63 Z M114 56 Q125 56 128 68 Q130 77 126 88 Q119 86 113 77 L106 63 Z'),
  region('traps', 'M80 46 Q90 51 100 46 L106 58 Q97 63 90 72 Q83 63 74 58 Z'),
  region('upper_back', 'M74 59 Q83 64 90 74 Q97 64 106 59 L112 84 Q106 94 101 108 L90 117 L79 108 Q74 94 68 84 Z'),
  region('lats', 'M69 89 Q77 109 90 119 Q103 109 111 89 L109 126 Q107 146 110 164 Q101 171 90 170 Q79 171 70 164 Q73 146 71 126 Z'),
  region('lower_back', 'M82 132 Q90 137 98 132 L100 160 Q90 166 80 160 Z'),
  region('forearms', 'M45 119 Q51 122 56 117 L54 134 Q50 147 45 160 L35 158 Q38 139 45 119 Z M135 119 Q129 122 124 117 L126 134 Q130 147 135 160 L145 158 Q142 139 135 119 Z'),
  region('triceps', 'M53 86 Q59 86 61 82 L59 102 Q57 114 51 121 L44 117 Q47 98 53 86 Z M127 86 Q121 86 119 82 L121 102 Q123 114 129 121 L136 117 Q133 98 127 86 Z'),
  region('hips', 'M70 170 Q80 173 90 171 Q100 173 110 170 L112 189 Q108 202 100 208 Q94 212 90 205 Q86 212 80 208 Q72 202 68 189 Z'),
  region('hamstrings', 'M68 208 Q77 212 87 213 L88 247 Q86 260 82 269 L70 267 Q66 242 68 208 Z M112 208 Q103 212 93 213 L92 247 Q94 260 98 269 L110 267 Q114 242 112 208 Z'),
  region('calves', 'M70 277 Q77 280 85 275 L84 306 L72 308 Q70 295 70 277 Z M110 277 Q103 280 95 275 L96 306 L108 308 Q110 295 110 277 Z')
].join('');

// Display-only copy of both figures for the muscle map (freshness / load colours).
export function muscleMapView() {
  return `<div class="muscle-map">${figure('front', front)}${figure('back', back)}</div>`.replace(/ role="button" tabindex="0" aria-pressed="false"/g, '');
}

export function gymFocusView() {
  const buttons = Object.entries(FOCUS_GROUPS).map(([id, group]) => `<button type="button" data-muscle="${id}" aria-pressed="false">${group.label}</button>`).join('');
  return `<section class="gym-focus-builder" aria-labelledby="gymFocusTitle">
    <div class="gym-focus-heading"><div><div class="label">Výběr partií</div><h2 id="gymFocusTitle">Cílený trénink</h2></div><span id="gymFocusCount" aria-live="polite">0 / 5 partií</span></div>
    <div class="gym-focus-layout"><div><div class="gym-view-switch" aria-label="Pohled na postavu"><button type="button" data-side="front" aria-pressed="true">Zepředu</button><button type="button" data-side="back" aria-pressed="false">Zezadu</button></div><div class="gym-figures">${figure('front', front)}${figure('back', back)}</div></div><div class="gym-focus-controls"><div id="gymFocusChoices" class="gym-focus-choices" aria-label="Vybrat partie">${buttons}</div><div class="gym-focus-action"><label for="gymFocusDuration">Délka</label><select id="gymFocusDuration"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>60 min</option><option value="75">75 min</option></select><button type="button" class="btn primary" id="generateFocusedGym" disabled>Generovat pro vybrané partie</button></div><p id="gymFocusStatus" role="status">Vyber až 5 partií na postavě nebo v seznamu.</p></div></div>
  </section>`;
}

export const gymFocusTheme = `
.gym-focus-builder{margin:20px 0 16px;padding:20px 0;border-top:1px solid color-mix(in srgb,var(--muted) 26%,var(--bg));border-bottom:1px solid color-mix(in srgb,var(--muted) 26%,var(--bg))}
.gym-focus-heading{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:16px}
.gym-focus-heading h2{font-size:20px;line-height:1.2;margin:4px 0 0;letter-spacing:0}
#gymFocusCount{color:color-mix(in srgb,var(--muted) 86%,var(--text));font-size:12px;white-space:nowrap}
.gym-focus-layout{display:grid;grid-template-columns:minmax(260px,400px) minmax(0,1fr);gap:28px;align-items:center}
.gym-view-switch{display:none}
.gym-figures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:400px}
.gym-figure{text-align:center;color:color-mix(in srgb,var(--muted) 86%,var(--text));font-size:12px}
.gym-figure svg{display:block;width:100%;max-height:330px;margin:auto}
.gym-body{fill:color-mix(in srgb,var(--muted) 60%,var(--bg));stroke:color-mix(in srgb,var(--text) 75%,var(--bg));stroke-width:1.4;stroke-linejoin:round}
.gym-muscle{fill:var(--fresh-fill,color-mix(in srgb,var(--text) 63%,var(--bg)));stroke:color-mix(in srgb,var(--muted) 31%,var(--bg));stroke-width:1.3;stroke-linejoin:round;cursor:pointer;transition:fill .15s ease,stroke .15s ease,filter .15s ease}
.gym-anatomy{fill:none;stroke:color-mix(in srgb,var(--muted) 32%,var(--bg));stroke-width:1;stroke-linecap:round;opacity:.72;pointer-events:none}
.gym-muscle:hover,.gym-muscle:focus-visible{fill:color-mix(in srgb,var(--primary) 95%,var(--bg));stroke:color-mix(in srgb,var(--primary) 26%,var(--text));outline:none}
.gym-muscle[aria-pressed="true"]{fill:color-mix(in srgb,var(--green) 77%,var(--text));stroke:color-mix(in srgb,var(--primary) 16%,var(--text));filter:drop-shadow(0 0 4px color-mix(in srgb,color-mix(in srgb,var(--green) 67%,var(--muted)) 73.3%,transparent))}
.gym-focus-controls{min-width:0}
.gym-focus-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.gym-focus-choices button{min-height:40px;background:color-mix(in srgb,var(--cyan) 9%,var(--bg));color:color-mix(in srgb,var(--muted) 27%,var(--text));border:1px solid color-mix(in srgb,var(--muted) 32%,var(--bg));border-radius:6px;text-align:left;padding:8px 11px;font-weight:600}
.gym-focus-choices button:hover,.gym-focus-choices button:focus-visible{border-color:color-mix(in srgb,var(--green) 88%,var(--muted));outline:none}
.gym-focus-choices button[aria-pressed="true"]{background:color-mix(in srgb,var(--green) 21%,var(--bg));border-color:color-mix(in srgb,var(--green) 91%,var(--bg));color:color-mix(in srgb,var(--primary) 11%,var(--text))}
.gym-focus-action{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}
.gym-focus-action label{font-size:12px;color:color-mix(in srgb,var(--muted) 86%,var(--text))}
.gym-focus-action select{background:color-mix(in srgb,var(--cyan) 8%,var(--bg));border:1px solid color-mix(in srgb,var(--muted) 40%,var(--bg));border-radius:6px;color:color-mix(in srgb,var(--primary) 5%,var(--text));padding:8px}
.gym-focus-action button{min-height:39px}
#gymFocusStatus{font-size:12px;color:color-mix(in srgb,var(--muted) 86%,var(--text));margin:10px 0 0;min-height:18px}
@media(max-width:760px){.gym-focus-layout{grid-template-columns:1fr;gap:15px}.gym-view-switch{display:grid;grid-template-columns:1fr 1fr;gap:2px;max-width:280px;margin:0 auto 8px;padding:3px;border:1px solid color-mix(in srgb,var(--muted) 40%,var(--bg));border-radius:7px;background:color-mix(in srgb,var(--cyan) 6%,var(--bg))}.gym-view-switch button{border:0;border-radius:5px;background:transparent;color:color-mix(in srgb,var(--muted) 86%,var(--text));padding:7px}.gym-view-switch button[aria-pressed="true"]{background:color-mix(in srgb,var(--primary) 29%,var(--bg));color:var(--text);font-weight:700}.gym-figures{display:block;max-width:330px;margin:auto}.gym-figure{display:none}.gym-figure.active{display:block}.gym-figure>span{display:none}.gym-figure svg{height:390px;width:auto;max-height:none;max-width:100%}.gym-focus-choices{grid-template-columns:repeat(2,minmax(0,1fr))}.gym-focus-action button{flex:1 1 100%}}
`;
