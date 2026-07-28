const r = require('./results.json');
const rows = [];
function walk(s, file) {
  file = s.file || file;
  for (const sp of s.suites || []) walk(sp, file);
  for (const t of s.specs || []) {
    const f = (t.file || file || '').replace(/\\/g, '/');
    for (const tr of t.tests || []) {
      const res = tr.results || [];
      const last = res[res.length - 1];
      const st = last ? last.status : '?';
      const retried = res.length > 1 && res.some((x) => x.status === 'failed') && st === 'passed';
      const m = f.match(/tests\/([\w-]+)\//);
      rows.push({
        mod: m ? m[1] : '?',
        title: t.title.replace(/\s*@.*/, ''),
        st: retried ? 'FLAKY-PASS' : st.toUpperCase(),
        dur: Math.round(((last && last.duration) || 0) / 100) / 10,
      });
    }
  }
}
for (const s of r.suites) walk(s, '');
let i = 1;
for (const x of rows) {
  console.log(
    String(i++).padStart(2),
    '|',
    x.mod.padEnd(10),
    '|',
    x.st.padEnd(10),
    '|',
    (x.dur + 's').padStart(6),
    '|',
    x.title,
  );
}
const p = rows.filter((x) => x.st === 'PASSED').length;
const fl = rows.filter((x) => x.st === 'FLAKY-PASS').length;
const fa = rows.filter((x) => x.st === 'FAILED').length;
console.log('\nTOTAL', rows.length, 'PASS', p, 'FLAKY-PASS', fl, 'FAIL', fa);
