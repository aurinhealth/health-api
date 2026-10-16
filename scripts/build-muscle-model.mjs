// Builds the 3D muscle figure of Svaly (ios-native Muscle3D.swift) from the OBJ of
// "Muscle Anatomy Visualized | Ecorche" by Alexander Lashko (Superhive, licensed by Aurin).
// The model is paid: it never goes into this repository. The output is uploaded to R2
// (scripts/upload-muscle-model.mjs) and the app downloads it from /app/api/muscles/model.
//
//   node scripts/build-muscle-model.mjs Ecorche_by_AlexLashko.obj muscles-v1.bin
//
// Format (little endian, every section 4-byte aligned):
//   "AURM", u32 version 1, u32 vertex count, u32 group count
//   per group: u32 index count, f32 centre x y z, f32 radius, u32 name length, name (UTF-8, padded to 4)
//   f32 positions (x y z per vertex, metres, y up, the figure faces +z, centred on x and z)
//   f32 normals (x y z per vertex)
//   u32 triangle indices, group after group
// The groups are the 17 muscles of src/muscle-fatigue.js MUSCLES, then "other" (muscles
// Aurin does not track) and "bone".
import { readFileSync, writeFileSync } from "node:fs";
import { MUSCLES } from "../src/muscle-fatigue.js";

const GROUPS = {
  quads: ["Rectus_Femoris", "Vastus_Lateralis", "Vastus_Medialis", "Vastus_Intermedius"],
  hamstrings: ["Biceps_Femoris_Long_Head", "Biceps_Femoris_Short_Head", "Semitendinosus", "Semimembranosus"],
  glutes: ["Gluteus_Maximus"],
  calves: ["Gastrocnemius_Lateral_Medial", "Soleus"],
  adductors: ["Adductor_Longus", "Adductor_Brevis", "Adductor_Magnus", "Gracilis", "Pectineus"],
  abductors: ["Gluteus_Medius", "Gluteus_Minimus", "Tensor_Fascia_Lata"],
  chest: ["Pectoralis_Major_Clavicular_Sternocostal_Abdominal", "Pectoralis_Minor"],
  back: ["Latissimus_Dorsi", "Rhomboideus_Major", "Rhomboideus_Minor", "Teres_Major", "Teres_Minor", "Infraspinatus"],
  lower_back: ["Iliocostalis_Lumborum", "Longissimus_Thoracis", "Spinalis_Thoracis"],
  traps: ["Trapezius"],
  biceps: ["Biceps_Brachii", "Brachialis", "Corabrachialis"],
  triceps: ["Triceps_Medial_Head", "Triceps_Lateral_Long_Heads", "Anconeus"],
  forearms: ["Flexor_Carpi_Radialis", "Flexor_Carpi_Ulnaris", "Pronator_Teres", "Palmaris_Longus", "Brachioradialis", "Flexor_Digitorum_Superficialis",
    "Extensor_Carpi_Radialis_Brevis", "Extensor_Carpi_Radialis_Longus", "Extensor_Digitorum", "Extensor_Digiti_Minimi", "Extensor_Carpi_Ulnaris",
    "Abductor_Pollicis_Longus", "Extensor_Pollicis_Longus", "Extensor_Pollicis_Brevis"],
  core: ["Rectus_Abdominis", "External_Oblique", "Serratus_Anterior"]
};
// The deltoid is one object; its faces are split front / side / rear by depth.
const DELTOID = "Deltoid_Anterior_Middle_Posterior";
const NAMES = [...MUSCLES, "other", "bone"];

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: node scripts/build-muscle-model.mjs model.obj out.bin");
const owner = new Map(Object.entries(GROUPS).flatMap(([group, objects]) => objects.map(o => [o, group])));
for (const group of Object.keys(GROUPS)) if (!MUSCLES.includes(group)) throw new Error("unknown muscle " + group);

const positions = [], faces = [];
let object = "", bone = false;
for (const line of readFileSync(input, "utf8").split("\n")) {
  if (line.startsWith("v ")) positions.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith("o ")) object = line.slice(2).trim();
  else if (line.startsWith("usemtl")) bone = line.includes("Skeleton");
  else if (line.startsWith("f ")) {
    const idx = line.trim().split(/\s+/).slice(1).map(t => parseInt(t, 10) - 1);
    for (let k = 1; k < idx.length - 1; k++) faces.push({ v: [idx[0], idx[k], idx[k + 1]], object, bone });
  }
}

// Centre the figure on x and z so it turns around its own axis; the feet stay at y 0.
const bounds = points => [0, 1, 2].map(a => points.reduce(([lo, hi], p) => [Math.min(lo, p[a]), Math.max(hi, p[a])], [Infinity, -Infinity]));
const [min, max] = [bounds(positions).map(b => b[0]), bounds(positions).map(b => b[1])];
const shift = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
for (const p of positions) for (let a = 0; a < 3; a++) p[a] -= shift[a];

const centroidZ = f => (positions[f.v[0]][2] + positions[f.v[1]][2] + positions[f.v[2]][2]) / 3;
const deltoidZ = faces.filter(f => f.object === DELTOID).map(centroidZ).sort((a, b) => a - b);
const [rear, front] = [deltoidZ[Math.floor(deltoidZ.length * 0.33)], deltoidZ[Math.floor(deltoidZ.length * 0.66)]];
const groupOf = f => {
  if (f.bone) return "bone";
  if (f.object === DELTOID) { const z = centroidZ(f); return z > front ? "shoulders" : z < rear ? "rear_delts" : "side_delts"; }
  return owner.get(f.object) || "other";
};

const normals = positions.map(() => [0, 0, 0]);
for (const { v: [a, b, c] } of faces) {
  const [pa, pb, pc] = [positions[a], positions[b], positions[c]];
  const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const i of [a, b, c]) for (let k = 0; k < 3; k++) normals[i][k] += n[k];
}
for (const n of normals) { const l = Math.hypot(...n) || 1; for (let k = 0; k < 3; k++) n[k] /= l; }

const groups = NAMES.map(name => ({ name, indices: [] }));
for (const f of faces) groups[NAMES.indexOf(groupOf(f))].indices.push(...f.v);
for (const g of groups) {
  if (!g.indices.length) throw new Error("no faces for " + g.name);
  const used = [...new Set(g.indices)].map(i => positions[i]);
  g.centre = bounds(used).map(([lo, hi]) => (lo + hi) / 2);
  g.radius = used.reduce((r, p) => Math.max(r, Math.hypot(p[0] - g.centre[0], p[1] - g.centre[1], p[2] - g.centre[2])), 0);
}

const chunks = [];
const u32 = values => chunks.push(Buffer.from(new Uint32Array(values).buffer));
const f32 = values => chunks.push(Buffer.from(new Float32Array(values).buffer));
chunks.push(Buffer.from("AURM"));
u32([1, positions.length, groups.length]);
for (const g of groups) {
  u32([g.indices.length]);
  f32([...g.centre, g.radius]);
  const name = Buffer.from(g.name);
  u32([name.length]);
  chunks.push(Buffer.concat([name, Buffer.alloc((4 - name.length % 4) % 4)]));
}
f32(positions.flat());
f32(normals.flat());
for (const g of groups) u32(g.indices);
writeFileSync(output, Buffer.concat(chunks));
console.log(`${positions.length} vertices, ${faces.length} triangles, ${groups.map(g => `${g.name} ${g.indices.length / 3}`).join(", ")}`);
