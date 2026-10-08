import fs from 'fs';
import { OUT, OLD_API, NEW_API, timedGet, stats, sleep } from './common.mjs';
// No-work endpoint: unknown widget id -> fast 400. Measures host/network floor, not widget logic.
const o=[],n=[];
for(let i=0;i<12;i++){ const order=i%2?[['n',NEW_API],['o',OLD_API]]:[['o',OLD_API],['n',NEW_API]];
  for(const [w,h] of order){ const r=await timedGet(h+'/v3/cms/widget/readPublic/000000000000000000000000'); (w==='o'?o:n).push(r); await sleep(400); } }
const out={note:'readPublic with a non-existent id (HTTP 400): host/network floor, no upstream work',old:{statuses:[...new Set(o.map(r=>r.status))],stats:stats(o.map(r=>r.ms)),runs:o.map(r=>r.ms)},new:{statuses:[...new Set(n.map(r=>r.status))],stats:stats(n.map(r=>r.ms)),runs:n.map(r=>r.ms)}};
fs.writeFileSync(OUT+'/baseline-results.json',JSON.stringify(out,null,1)); console.log(JSON.stringify({old:out.old.stats,new:out.new.stats,os:out.old.statuses,ns:out.new.statuses}));
