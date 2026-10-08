// Aggregates the latest run by browser project (reads reports/results.json).
const r = require('./results.json');
const byProject = {};
function walk(s) {
  for (const sp of s.suites || []) walk(sp);
  for (const t of s.specs || []) {
    for (const tr of t.tests || []) {
      const proj = tr.projectName || '?';
      const res = tr.results || [];
      const last = res[res.length - 1];
      const st = last ? last.status : '?';
      const retried = res.length > 1 && res.some((x) => x.status === 'failed') && st === 'passed';
      byProject[proj] = byProject[proj] || { passed: 0, failed: 0, flaky: 0, skipped: 0 };
      if (tr.status === 'skipped' || st === 'skipped') byProject[proj].skipped++;
      else if (retried) byProject[proj].flaky++;
      else if (st === 'passed') byProject[proj].passed++;
      else byProject[proj].failed++;
    }
  }
}
for (const s of r.suites) walk(s);
console.log(JSON.stringify(byProject, null, 1));
