import fs from 'fs';
const H='https://v3-5api.pocsample.in', ID='6abe3cfa36f9ebeed640c15b', U=`${H}/v3/cms/widget/readPublic/${ID}`;
const t=async(u,o={})=>{const s=performance.now();try{const r=await fetch(u,{signal:AbortSignal.timeout(30000),...o});const b=await r.text();return{s:r.status,ms:performance.now()-s,b:b.length,h:r.headers,body:b}}catch(e){return{s:0,ms:performance.now()-s,err:e.message}}};
const pct=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(0)};
const st=a=>`min ${Math.min(...a).toFixed(0)} avg ${(a.reduce((x,y)=>x+y,0)/a.length).toFixed(0)} p50 ${pct(a,.5)} p95 ${pct(a,.95)} max ${Math.max(...a).toFixed(0)} ms`;
const out={};
// 1 sequential
let seq=[];for(let i=0;i<20;i++){const r=await t(U);seq.push(r);}
console.log('SEQ x20 ',st(seq.map(r=>r.ms)),'statuses',[...new Set(seq.map(r=>r.s))].join());
// 2 ramp concurrency
for(const c of [2,5,10]){const t0=performance.now();const rs=await Promise.all(Array.from({length:c*3},()=>t(U)));const el=(performance.now()-t0)/1000;
 console.log(`CONC ${c} x${c*3}`,st(rs.map(r=>r.ms)),'errors',rs.filter(r=>r.s!==200).length,'statuses',[...new Set(rs.map(r=>r.s))].join(),'rps',(rs.length/el).toFixed(1));}
// 3 security
const r=await t(U);const g=n=>r.h.get(n);
console.log('--- SECURITY');
console.log('proto https; HSTS:',g('strict-transport-security'),'| CTO:',g('x-content-type-options'),'| XFO:',g('x-frame-options'),'| CSP:',g('content-security-policy'),'| CORS:',g('access-control-allow-origin'),'| server:',g('server'),'| x-powered-by:',g('x-powered-by'),'| cache:',g('cache-control'));
const http=await t(U.replace('https','http'),{redirect:'manual'});console.log('http->',http.s,http.h?.get('location'));
const bad={noAuth:r.s,badId:(await t(`${H}/v3/cms/widget/readPublic/zzz`)).s,nonexistent:(await t(`${H}/v3/cms/widget/readPublic/000000000000000000000000`)).s,
 nosqlId:(await t(`${H}/v3/cms/widget/readPublic/%7B%22$ne%22:null%7D`)).s,traversal:(await t(`${H}/v3/cms/widget/readPublic/..%2f..%2fetc%2fpasswd`)).s,
 post:(await t(U,{method:'POST'})).s,put:(await t(U,{method:'PUT',body:'{}'})).s,del:(await t(U,{method:'DELETE'})).s};
console.log('status matrix',JSON.stringify(bad));
const nx=await t(`${H}/v3/cms/widget/readPublic/000000000000000000000000`);console.log('nonexistent body:',nx.body?.slice(0,160));
const bi=await t(`${H}/v3/cms/widget/readPublic/zzz`);console.log('badId body:',bi.body?.slice(0,200));
const cors=await t(U,{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'GET'}});console.log('CORS evil origin ->',cors.s,cors.h?.get('access-control-allow-origin'));
const j=JSON.parse(r.body);console.log('exposes keys:',Object.keys(j).join(','),'| path:',j.path,'| folderId:',j.folderId);
// rate limit probe: 40 quick requests
const rl=await Promise.all(Array.from({length:40},()=>t(U)));console.log('burst x40 statuses',[...new Set(rl.map(x=>x.s))].join(),'429s',rl.filter(x=>x.s===429).length,'ratelimit hdr',rl[0].h?.get('x-ratelimit-limit')||rl[0].h?.get('ratelimit-limit')||'none');
