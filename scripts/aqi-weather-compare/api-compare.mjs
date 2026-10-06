import fs from 'fs';
import { OUT, OLD_API, NEW_API, timedGet, stats, sleep } from './common.mjs';
const pairs=JSON.parse(fs.readFileSync(OUT+'/pairs.json','utf8'));
const RUNS=10;
const res={startedAt:new Date().toISOString(),runs:RUNS,pairs:[]};
const paths=(o,p='',s=new Map())=>{ if(Array.isArray(o)){ o.forEach(x=>paths(x,p+'[]',s)); } else if(o&&typeof o==='object'){ for(const k in o) paths(o[k],p+'.'+k,s); } else s.set(p, new Set([...(s.get(p)||[]),o===null?'null':typeof o])); return s; };
const norm=s=>(s||'').toLowerCase().replace(/[^a-z]/g,'');
for(const p of pairs){
  const oUrl=`${OLD_API}/v3/cms/widget/readPublic/${p.oldId}`, nUrl=`${NEW_API}/v3/cms/widget/readPublic/${p.newId}`;
  const o=[],n=[];
  for(let i=0;i<RUNS;i++){ // alternate order each run so neither host systematically goes first
    const order=i%2?[['n',nUrl],['o',oUrl]]:[['o',oUrl],['n',nUrl]];
    for(const [w,u] of order){ const r=await timedGet(u); (w==='o'?o:n).push(r); await sleep(500); }
    await sleep(500);
  }
  const strip=r=>({status:r.status,ms:r.ms,bytes:r.bytes,error:r.error});
  const first={o:o[0],n:n[0]};
  fs.writeFileSync(`${OUT}/samples/cmp-old-${p.key}.json`,first.o.body); fs.writeFileSync(`${OUT}/samples/cmp-new-${p.key}.json`,first.n.body);
  let oj,nj; try{oj=JSON.parse(first.o.body)}catch{} try{nj=JSON.parse(first.n.body)}catch{}
  // structure diff (only response-owned fields, not echoed config)
  const skip=k=>/^\.(data|path|_id|folderId|faceId)/.test(k);
  let structure=null;
  if(oj&&nj){ const A=paths(oj),B=paths(nj); const rm=[...A.keys()].filter(k=>!B.has(k)&&!skip(k)), add=[...B.keys()].filter(k=>!A.has(k)&&!skip(k));
    const typeChg=[...A.keys()].filter(k=>B.has(k)&&!skip(k)&&[...A.get(k)].join()!==[...B.get(k)].join()).map(k=>`${k}: ${[...A.get(k)]} -> ${[...B.get(k)]}`);
    structure={removedFields:rm,addedFields:add,typeChanges:typeChg}; }
  // value comparison
  const values=[];
  if(p.type==='weather'&&oj?.weather&&nj?.weather){
    for(const oc of oj.weather){ const key=norm(oc.city?.name); const nc=nj.weather.find(x=>norm(x.city?.name)===key);
      if(!nc){ values.push({city:oc.city?.name,field:'city',old:'present',new:'MISSING'}); continue; }
      const t=(a,b,f)=>values.push({city:oc.city?.name,field:f,old:a??null,new:b??null});
      t(oc.todayData?.main?.temp,nc.todayData?.main?.temp,'temp'); t(oc.todayData?.main?.feels_like,nc.todayData?.main?.feels_like,'feels_like');
      t(oc.todayData?.main?.humidity,nc.todayData?.main?.humidity,'humidity'); t(oc.todayData?.main?.pressure,nc.todayData?.main?.pressure,'pressure');
      t(oc.todayData?.wind?.speed,nc.todayData?.wind?.speed,'wind.speed'); t(oc.todayData?.wind?.deg,nc.todayData?.wind?.deg,'wind.deg');
      t(oc.todayData?.weather?.[0]?.main,nc.todayData?.weather?.[0]?.main,'condition'); t(oc.todayData?.weather?.[0]?.icon,nc.todayData?.weather?.[0]?.icon,'icon');
      t(oc.todayData?.visibility,nc.todayData?.visibility,'visibility'); t(oc.todayData?.clouds?.all,nc.todayData?.clouds?.all,'clouds');
      t(oc.city?.sunrise,nc.city?.sunrise,'sunrise'); t(oc.city?.sunset,nc.city?.sunset,'sunset'); t(oc.city?.timezone,nc.city?.timezone,'timezone');
      t(oc.todayData?.dt,nc.todayData?.dt,'timestamp(dt)'); t(oc.forecast?.length,nc.forecast?.length,'forecast.length');
    }
    values.push({city:'(all)',field:'cityCount',old:oj.weather.length,new:nj.weather.length});
  }
  if(p.type==='aqi'&&oj?.aqiData&&nj?.aqiData){
    for(const oc of oj.aqiData){ const key=norm(oc.city); const nc=nj.aqiData.find(x=>norm(x.city)===key);
      if(!nc){ values.push({city:oc.city,field:'city',old:'present',new:'MISSING'}); continue; }
      const t=(a,b,f)=>values.push({city:oc.city,field:f,old:a??null,new:b??null});
      t(oc.aqi,nc.aqi,'aqi'); for(const k of ['pm25','pm10','o3','no2','so2','co','nh3']) t(oc.iaqi?.[k]?.v,nc.iaqi?.[k]?.v,k);
      t(oc.time??null,nc.time??null,'timestamp');
    }
    values.push({city:'(all)',field:'cityCount',old:oj.aqiData.length,new:nj.aqiData.length});
  }
  const sum=a=>({runs:a.map(strip),stats:stats(a.filter(r=>r.status===200).map(r=>r.ms)),errors:a.filter(r=>r.status!==200).length,statuses:[...new Set(a.map(r=>r.status))],size:first.o?undefined:0});
  res.pairs.push({key:p.key,type:p.type,label:p.label,oldId:p.oldId,newId:p.newId,data:p.data,
    single:{old:strip(first.o),new:strip(first.n)}, old:sum(o), new:sum(n), oldErrorBody:first.o.status!==200?first.o.body.slice(0,200):null, newErrorBody:first.n.status!==200?first.n.body.slice(0,200):null, structure, values});
  console.log(p.key,'old',first.o.status,first.o.ms+'ms',first.o.bytes+'B','| new',first.n.status,first.n.ms+'ms',first.n.bytes+'B');
}
res.finishedAt=new Date().toISOString();
fs.writeFileSync(OUT+'/api-results.json',JSON.stringify(res,null,1));
