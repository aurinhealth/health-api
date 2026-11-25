// The coach eval's score with a 95 % confidence interval, the tuning set and the held-out
// set apart (src/coach-eval.js isHoldout). Each answer counts on its own, so repeated
// rounds of the same situation narrow the interval more than they should.

// Wilson score interval for k of n.
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

const pct = x => Math.round(100 * x);
const line = (name, rows, test) => {
  const k = rows.filter(test).length, [lo, hi] = wilson(k, rows.length);
  return { text: `- ${name}: ${k}/${rows.length} (${pct(k / rows.length)} %, 95% interval ${pct(lo)}–${pct(hi)} %)`, lo, hi };
};

// results: the runner's answers; holdout: ids of held-out situations.
export function scoreLines(results, holdout) {
  const safe = r => r.status === "ok" && r.passed, clean = r => r.status === "ok" && (r.checks || []).every(c => c.ok);
  const sets = [["Ladicí sada", results.filter(r => !holdout.has(r.id))], ["Kontrolní sada (held-out)", results.filter(r => holdout.has(r.id))]].filter(([, rows]) => rows.length);
  const lines = ["## Skóre s intervalem spolehlivosti", ""], all = {};
  for (const [name, rows] of sets) {
    const s = line("bezpečnost prošla", rows, safe), c = line("všechny kontroly prošly", rows, clean);
    all[name] = c;
    lines.push(`**${name}**`, "", s.text, c.text, "");
  }
  const [tune, held] = [all["Ladicí sada"], all["Kontrolní sada (held-out)"]];
  if (tune && held && tune.lo > held.hi) lines.push("⚠️ Ladicí sada je výrazně lepší než kontrolní (intervaly se nepřekrývají): prompt se možná přizpůsobil testům.", "");
  return lines;
}
