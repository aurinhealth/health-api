// The records of a FIT file (the format bike computers and watches write):
// per second the time, position, altitude, distance, speed, heart rate,
// cadence and power. Only the record message (global number 20) is read;
// everything else, developer fields included, is skipped by its size.
// A gzipped file is unpacked first.

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z in Unix seconds
const SEMICIRCLE = 180 / 2 ** 31;
function read(view, at, size, base, little) {
  const signed = base === 0x01 || base === 0x83 || base === 0x85;
  let v;
  if (size === 1) v = signed ? view.getInt8(at) : view.getUint8(at);
  else if (size === 2) v = signed ? view.getInt16(at, little) : view.getUint16(at, little);
  else if (size === 4) v = signed ? view.getInt32(at, little) : view.getUint32(at, little);
  else return null;
  // "No value": all ones unsigned, the largest number signed.
  return v === (signed ? 2 ** (size * 8 - 1) - 1 : 2 ** (size * 8) - 1) ? null : v;
}

// Unpacked at most MAX_UNPACKED bytes, so a small file cannot grow without end.
const MAX_UNPACKED = 64 * 1024 * 1024;
async function unpacked(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || typeof DecompressionStream !== 'function') return bytes;
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_UNPACKED) { await reader.cancel(); return new Uint8Array(0); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// [{ t (s from the first record), time (Unix s), lat, lon, alt, dist, speed, hr, cadence, watts }]
export async function parseFit(input) {
  const bytes = await unpacked(input instanceof Uint8Array ? input : new Uint8Array(input));
  if (bytes.length < 12) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = bytes[0];
  if (headerSize < 12 || String.fromCharCode(...bytes.subarray(8, 12)) !== '.FIT') return [];
  const end = Math.min(bytes.length, headerSize + view.getUint32(4, true));
  const defs = new Map(), out = [];
  let at = headerSize, last = null;
  while (at < end) {
    const head = bytes[at++];
    let local, offset = null;
    if (head & 0x80) { local = (head >> 5) & 0x03; offset = head & 0x1f; }
    else if (head & 0x40) {
      // Definition: reserved, architecture, global number, fields (+ developer fields).
      if (at + 5 > end) break;
      const little = bytes[at + 1] === 0, global = view.getUint16(at + 2, little), count = bytes[at + 4];
      at += 5;
      const fields = [];
      for (let i = 0; i < count && at + 3 <= end; i++, at += 3) fields.push({ num: bytes[at], size: bytes[at + 1], base: bytes[at + 2] });
      let extra = 0;
      if (head & 0x20 && at < end) { const devs = bytes[at++]; for (let i = 0; i < devs && at + 3 <= end; i++, at += 3) extra += bytes[at + 1]; }
      defs.set(head & 0x0f, { little, global, fields, extra });
      continue;
    } else local = head & 0x0f;
    const def = defs.get(local);
    if (!def) break;
    const values = {};
    for (const f of def.fields) {
      if (at + f.size > end) { at = end; break; }
      values[f.num] = read(view, at, f.size, f.base, def.little);
      at += f.size;
    }
    at += def.extra;
    let time = values[253] ?? null;
    if (offset != null && last != null) time = (last & ~0x1f) + offset + (offset < (last & 0x1f) ? 0x20 : 0);
    if (time != null) last = time;
    if (def.global !== 20 || time == null) continue;
    const alt = values[78] ?? values[2];
    out.push({
      time: time + FIT_EPOCH,
      lat: values[0] != null && values[1] != null ? values[0] * SEMICIRCLE : null,
      lon: values[0] != null && values[1] != null ? values[1] * SEMICIRCLE : null,
      alt: alt != null ? alt / 5 - 500 : null,
      dist: values[5] != null ? values[5] / 100 : null,
      speed: (values[73] ?? values[6]) != null ? (values[73] ?? values[6]) / 1000 : null,
      hr: values[3] > 25 && values[3] < 250 ? values[3] : null,
      cadence: values[4] != null && values[4] < 250 ? values[4] : null,
      watts: values[7] != null && values[7] < 3000 ? values[7] : null
    });
  }
  const t0 = out[0]?.time;
  return out.map(p => ({ t: p.time - t0, ...p })).filter(p => p.t >= 0 && p.t < 86400);
}

// The records as Intervals.icu's streams ({ type, data }), so the detail and
// the ride analysis read them as they read Intervals.icu's.
export function fitStreams(points) {
  const has = key => points.some(p => p[key] != null);
  const streams = [{ type: 'time', data: points.map(p => p.t) }];
  for (const [type, key] of [['watts', 'watts'], ['heartrate', 'hr'], ['cadence', 'cadence'], ['altitude', 'alt'], ['velocity_smooth', 'speed']]) {
    if (has(key)) streams.push({ type, data: points.map(p => p[key]) });
  }
  if (points.some(p => p.lat != null && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && (p.lat || p.lon))) {
    streams.push({ type: 'latlng', data: points.map(p => p.lat != null && (p.lat || p.lon) ? [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lon * 1e6) / 1e6] : null) });
  }
  return streams;
}
