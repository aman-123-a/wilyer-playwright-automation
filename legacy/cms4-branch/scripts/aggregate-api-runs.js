// Aggregate multiple api-audit runs into median/p95 per endpoint.
// Usage: node scripts/aggregate-api-runs.js
import fs from 'fs';
import path from 'path';

const RUNS_DIR = path.resolve('reports/api-audit/runs');
const files = fs.readdirSync(RUNS_DIR).filter((f) => /^run-\d+\.json$/.test(f)).sort();

const norm = (u) => { try { return new URL(u).pathname; } catch { return u; } };
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
};
const med = (a) => pct(a, 50);

// key = "METHOD path" → { samples:[ms...], statuses:Set, modules:Set, counts:[per-run dup counts] }
const byEndpoint = {};

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8'));
  // count duplicates per run (module|path) for app calls only
  for (const c of data.calls) {
    if (c.status === 0) continue; // skip aborted-on-nav (timing meaningless)
    const key = `${c.method} ${norm(c.url)}`;
    const e = (byEndpoint[key] = byEndpoint[key] || { samples: [], statuses: new Set(), modules: new Set() });
    e.samples.push(c.ms);
    e.statuses.add(c.status);
    e.modules.add(c.module);
  }
}

const rows = Object.entries(byEndpoint)
  .map(([k, e]) => ({
    endpoint: k,
    n: e.samples.length,
    min: Math.min(...e.samples),
    median: med(e.samples),
    p95: pct(e.samples, 95),
    max: Math.max(...e.samples),
    statuses: [...e.statuses].join(','),
  }))
  .sort((a, b) => b.median - a.median);

console.log(`Aggregated ${files.length} runs: ${files.join(', ')}\n`);
console.log('endpoint | n | min | median | p95 | max | statuses');
for (const r of rows) {
  console.log(`${r.endpoint} | ${r.n} | ${r.min} | ${r.median} | ${r.p95} | ${r.max} | ${r.statuses}`);
}

fs.writeFileSync(
  path.resolve('reports/api-audit/aggregate.json'),
  JSON.stringify({ runs: files.length, generatedFrom: files, rows }, null, 2)
);
console.log('\nwritten: reports/api-audit/aggregate.json');
