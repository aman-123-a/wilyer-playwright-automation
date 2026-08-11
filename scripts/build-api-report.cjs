const fs=require('fs');const path=require('path');
const d=require(path.resolve('reports/api-audit/api-report.json'));
const norm=u=>{try{return new URL(u).pathname}catch{return u}};
const s=ms=>(ms/1000).toFixed(1)+' s';
const calls=d.calls.filter(x=>{try{return new URL(x.url).host.includes('api.wilyersignage.com')}catch{return false}});
const ok=calls.filter(x=>x.status>0);

// frequency
const freq={};
for(const x of calls){const k=x.method+' '+norm(x.url);const e=freq[k]||(freq[k]={n:0,ms:[],st:{},mod:new Set()});e.n++;if(x.status>0)e.ms.push(x.ms);e.st[x.status]=(e.st[x.status]||0)+1;e.mod.add(x.module);}
const avg=a=>a.length?Math.round(a.reduce((p,v)=>p+v,0)/a.length):0;
const top20=Object.entries(freq).sort((a,b)=>b[1].n-a[1].n).slice(0,20);

// response time per endpoint
const rt={};
for(const x of ok){const k=x.method+' '+norm(x.url);(rt[k]||(rt[k]=[])).push(x.ms);}
const rtRows=Object.entries(rt).map(([k,a])=>({k,n:a.length,min:Math.min(...a),avg:avg(a),max:Math.max(...a)})).sort((a,b)=>b.avg-a.avg);

// overall
const all=ok.map(x=>x.ms).sort((a,b)=>a-b);
const oAvg=avg(all),oMed=all[Math.floor(all.length*0.5)],oP95=all[Math.floor(all.length*0.95)];

let m=`# CMS — Top 20 Most-Used API Endpoints

**Generated:** 2026-06-11
**Data source:** \`reports/api-audit/api-report.json\` (audit crawl captured 2026-06-10T11:55Z)
**Base API host:** \`https://api.wilyersignage.com\`
**CMS host:** \`https://cms.wilyersignage.com\`

> All response times are shown in **seconds (s)**.

---

## ⚠️ Data-source disclaimer (read first)

This report is **NOT** built from 1 month of production traffic. No production
access log / APM export exists in this repo. It is derived from a **single
automated audit crawl** that loaded each CMS module page **once**. Therefore:

- **Counts = calls per one full pass through the CMS**, not monthly volume.
- Endpoints that fire on every page load (\`auth/checkAccess\`, \`announcement/read\`)
  dominate the ranking — and would also dominate a real monthly count.
- \`status 0\` = request aborted on navigation (timing/counts unreliable for those).

To produce a **real 1-month report**, supply one of: Cloudflare RUM/access logs,
API-gateway or nginx logs, or DB/APM query stats.

---

## Performance summary (response time)

Across all ${all.length} completed CMS API calls (aborted/\`status 0\` excluded):

| Metric | Value |
|--|--:|
| Average response time | **${s(oAvg)}** |
| Median (p50) | ${s(oMed)} |
| p95 | ${s(oP95)} |
| Fastest | ${s(all[0])} |
| Slowest | ${s(all[all.length-1])} |
| Slow threshold (configured) | 2.0 s |

---

## 🔴 High response time — slowest endpoints (top priority)

These breach the 2.0 s slow threshold. Optimize first.

| # | Method + path | Avg |
|--:|--|--:|
`;
rtRows.filter(r=>r.avg>2000).forEach((r,i)=>{m+=`| ${i+1} | \`${r.k}\` | ${s(r.avg)} |\n`;});
m+=`
## 🟢 Low response time — fastest endpoints (healthy)

| # | Method + path | Avg |
|--:|--|--:|
`;
[...rtRows].sort((a,b)=>a.avg-b.avg).slice(0,5).forEach((r,i)=>{m+=`| ${i+1} | \`${r.k}\` | ${s(r.avg)} |\n`;});

m+=`
---

## Top 20 endpoints (by call count in the crawl)

| # | Calls | Method + path | Avg | Status (count) |
|--:|--:|--|--:|--|
`;
top20.forEach(([k,e],i)=>{const st=Object.entries(e.st).map(([c,n])=>(c==='0'?'abort':c)+':'+n).join(', ');m+=`| ${i+1} | ${e.n} | \`${k}\` | ${s(avg(e.ms))} | ${st} |\n`;});

m+=`
---

## Response time by endpoint (slowest first)

| # | Method + path | n | Min | Avg | Max |
|--:|--|--:|--:|--:|--:|
`;
rtRows.forEach((r,i)=>{m+=`| ${i+1} | \`${r.k}\` | ${r.n} | ${s(r.min)} | ${s(r.avg)} | ${s(r.max)} |\n`;});

m+=`
---

## Notes & observations

- **\`auth/checkAccess\`** runs on every route as an auth gate (some 401s expected pre-auth/post-logout).
- **\`announcement/read\`** is a global poll fired on every module.
- **Slowest hot endpoints:** \`mdm/readAll\`, \`auth/login\`, \`screen/readStats\` — all above the 2.0 s slow threshold; candidates for caching / pagination review.
- **Library module** is the heaviest single page (5 distinct read endpoints).
`;

fs.writeFileSync(path.resolve('reports/api-audit/top20-api-usage-report.md'),m);
console.log('markdown rebuilt (seconds)');
