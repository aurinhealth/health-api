import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Today audit 25: the app's text greys stay at least 4.5:1 (WCAG AA for small
// text, not rounded) on the surfaces they sit on, in light and dark mode.
const src = readFileSync(new URL('../ios-native/Shared/Palette.swift', import.meta.url), 'utf8');
const token = name => {
  const m = new RegExp(`static let ${name} = Color\\(light: 0x([0-9A-Fa-f]{6}), dark: 0x([0-9A-Fa-f]{6})\\)`).exec(src);
  assert.ok(m, name);
  return { light: parseInt(m[1], 16), dark: parseInt(m[2], 16) };
};
const lum = h => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(h >> 16 & 255) + 0.7152 * f(h >> 8 & 255) + 0.0722 * f(h & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('muted is 4.5:1 on every surface and section glow, faint on every surface', () => {
  const surfaces = ['background', 'settingsBackground', 'card', 'cardLift'].map(token);
  const glows = ['today', 'health', 'training', 'food'].map(n => token(n));
  for (const [name, on] of [['muted', [...surfaces, ...glows]], ['faint', surfaces]]) {
    const t = token(name);
    for (const s of on) for (const mode of ['light', 'dark']) {
      const r = ratio(t[mode], s[mode]);
      assert.ok(r >= 4.5, `${name} ${mode} on ${s[mode].toString(16)}: ${r.toFixed(2)}`);
    }
  }
});
