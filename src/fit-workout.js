// A planned ride, run or swim as a Garmin FIT workout file (.fit), the format
// Garmin, Wahoo, Hammerhead Karoo, COROS and TrainingPeaks read. Built here
// without a library: a file_id, a workout and one workout_step per section,
// with repeats as FIT's "repeat until steps complete" step.
//
// Targets: a ride in % of FTP (FIT's own relative power, so the head unit
// uses the rider's FTP); a run as a speed range from the athlete's threshold
// pace when it is known, otherwise without a target; a swim by distance or
// time without a target (pool watches have no pace target).

const SPORT = { ride: 2, run: 1, swim: 5 };
const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3 };
const TARGET = { speed: 0, open: 2, power: 4 };
const DURATION = { time: 0, distance: 1, repeat: 6 };
// Seconds between the Unix epoch and the FIT epoch (1989-12-31 00:00 UTC).
const FIT_EPOCH = 631065600;
const NAME_BYTES = 40, STEP_NAME_BYTES = 24;

const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
export function fitCrc(bytes, crc = 0) {
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];
    tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
  }
  return crc;
}

// UTF-8, cut on a whole character, padded with zeros to the field size.
function fitString(value, size) {
  const out = new Uint8Array(size);
  const encoder = new TextEncoder();
  let used = 0;
  for (const ch of String(value || "")) {
    const b = encoder.encode(ch);
    if (used + b.length > size - 1) break;
    out.set(b, used);
    used += b.length;
  }
  return out;
}

// Base types: enum, uint16, uint32, string.
const BASE = { enum: [0x00, 1], uint16: [0x84, 2], uint32: [0x86, 4], string: [0x07, 0] };

class FitWriter {
  constructor() { this.parts = []; this.length = 0; }
  push(bytes) { this.parts.push(bytes); this.length += bytes.length; }
  // fields: [fieldNumber, baseType, size?]
  define(local, global, fields) {
    const b = new Uint8Array(6 + fields.length * 3);
    const v = new DataView(b.buffer);
    b[0] = 0x40 | local; b[1] = 0; b[2] = 0; v.setUint16(3, global, true); b[5] = fields.length;
    fields.forEach(([num, type, size], i) => { b[6 + i * 3] = num; b[7 + i * 3] = size ?? BASE[type][1]; b[8 + i * 3] = BASE[type][0]; });
    this.push(b);
    this.fields = this.fields || {};
    this.fields[local] = fields;
  }
  data(local, values) {
    const fields = this.fields[local];
    const size = 1 + fields.reduce((sum, [, type, s]) => sum + (s ?? BASE[type][1]), 0);
    const b = new Uint8Array(size);
    const v = new DataView(b.buffer);
    b[0] = local;
    let at = 1;
    fields.forEach(([, type, s], i) => {
      const value = values[i];
      if (type === "string") b.set(fitString(value, s), at);
      else if (type === "enum") b[at] = value;
      else if (type === "uint16") v.setUint16(at, value, true);
      else v.setUint32(at, value, true);
      at += s ?? BASE[type][1];
    });
    this.push(b);
  }
  bytes() {
    const header = new Uint8Array(14);
    const hv = new DataView(header.buffer);
    header[0] = 14; header[1] = 0x20; hv.setUint16(2, 2132, true); hv.setUint32(4, this.length, true);
    header.set([0x2E, 0x46, 0x49, 0x54], 8);
    hv.setUint16(12, fitCrc(header.subarray(0, 12)), true);
    const out = new Uint8Array(14 + this.length + 2);
    out.set(header, 0);
    let at = 14;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    new DataView(out.buffer).setUint16(at, fitCrc(out.subarray(0, at)), true);
    return out;
  }
}

const zone = (sport, pct) => sport === "ride"
  ? (pct < 56 ? "Z1" : pct < 76 ? "Z2" : pct < 88 ? "Z3" : pct < 95 ? "SS" : pct < 106 ? "Z4" : "Z5")
  : sport === "run" ? (pct < 78 ? "Z1" : pct < 89 ? "Z2" : pct < 96 ? "Z3" : pct < 102 ? "Z4" : "Z5")
    : (pct < 90 ? "Z1" : pct < 96 ? "Z2" : pct < 99 ? "Z3" : pct < 103 ? "Z4" : "Z5");

// The template (endurance-templates.js: sport, name, blocks of repeats and
// steps with seconds / km / meters and low–high %) as FIT steps.
export function fitSteps(template, { thresholdPace = null } = {}) {
  const sport = SPORT[template.sport] ? template.sport : "ride";
  const speed = sport === "run" && thresholdPace >= 150 && thresholdPace <= 600 ? 1000 / thresholdPace : null;
  const blocks = template.blocks || [];
  const steps = [];
  blocks.forEach((block, bi) => {
    const first = steps.length;
    block.steps.forEach(s => {
      const pct = s.rest ? 0 : (s.low + s.high) / 2;
      const alone = block.repeats <= 1 && block.steps.length === 1;
      const intensity = s.rest ? INTENSITY.rest
        : alone && bi === 0 && blocks.length > 1 && pct <= 75 ? INTENSITY.warmup
          : alone && bi === blocks.length - 1 && blocks.length > 1 && pct <= 75 ? INTENSITY.cooldown : INTENSITY.active;
      const duration = s.meters != null ? [DURATION.distance, Math.round(s.meters * 100)]
        : s.km != null ? [DURATION.distance, Math.round(s.km * 100000)]
          : [DURATION.time, Math.round((s.seconds || 0) * 1000)];
      let target = [TARGET.open, 0, 0];
      if (!s.rest && sport === "ride") target = [TARGET.power, Math.round(s.low), Math.round(s.high)];
      if (!s.rest && speed) target = [TARGET.speed, Math.round(speed * s.low / 100 * 1000), Math.round(speed * s.high / 100 * 1000)];
      const range = s.low === s.high ? `${s.low}` : `${s.low}-${s.high}`;
      const unit = sport === "ride" ? "% FTP" : sport === "run" ? "% pace" : "% CSS";
      const name = s.rest ? (s.label || "Rest") : (s.label || zone(sport, pct)) + (target[0] === TARGET.open ? ` ${range}${unit}` : "");
      steps.push({ name, durationType: duration[0], durationValue: duration[1], targetType: target[0], targetValue: 0, low: target[1], high: target[2], intensity });
    });
    if (block.repeats > 1) steps.push({ name: "", durationType: DURATION.repeat, durationValue: first, targetType: TARGET.open, targetValue: block.repeats, low: 0, high: 0, intensity: INTENSITY.active });
  });
  return steps;
}

// The whole file. `poolLength` in metres for a pool swim.
export function fitWorkoutFile(template, { thresholdPace = null, poolLength = null, now = Date.now() } = {}) {
  const sport = SPORT[template.sport] ? template.sport : "ride";
  const steps = fitSteps(template, { thresholdPace });
  const w = new FitWriter();
  w.define(0, 0, [[0, "enum"], [1, "uint16"], [2, "uint16"], [4, "uint32"]]);
  w.data(0, [5, 255, 0, Math.max(0, Math.floor(now / 1000) - FIT_EPOCH)]);
  const pool = sport === "swim" && poolLength > 0;
  w.define(1, 26, [[4, "enum"], [6, "uint16"], [8, "string", NAME_BYTES], ...(pool ? [[14, "uint16"], [15, "enum"]] : [])]);
  w.data(1, [SPORT[sport], steps.length, template.name || "Aurin workout", ...(pool ? [Math.round(poolLength * 100), 0] : [])]);
  w.define(2, 27, [[254, "uint16"], [0, "string", STEP_NAME_BYTES], [1, "enum"], [2, "uint32"], [3, "enum"], [4, "uint32"], [5, "uint32"], [6, "uint32"], [7, "enum"]]);
  steps.forEach((s, i) => w.data(2, [i, s.name, s.durationType, s.durationValue, s.targetType, s.targetValue, s.low, s.high, s.intensity]));
  return w.bytes();
}
