import fs from 'fs';
import { OUT, NEW_API, loginNew, api, sleep } from './common.mjs';
const S = OUT+'/samples/';
// old widget id -> role. Locations mirrored exactly (cities + coordinates) from the OLD widget's own config.
const PAIRS = [
  {key:'W-DEL',type:'weather',label:'Delhi',   oldId:'6458ede82a3e6572987ac131'},
  {key:'W-MUM',type:'weather',label:'Mumbai (+Delhi,Dubai)', oldId:'64b9243fa0d9d61af1b4418d'},
  {key:'W-BLR',type:'weather',label:'Bengaluru (+Visakhapatnam,Delhi)', oldId:'69957d78a319087eff36b60b'},
  {key:'W-MAA',type:'weather',label:'Chennai', oldId:'6a4e27f4ab6cc5e2836a1364'},
  {key:'W-CCU',type:'weather',label:'Kolkata (+Jaipur)', oldId:'67e3d95ab1595d3173a6b21c'},
  {key:'A-DEL',type:'aqi',label:'Delhi (+Gurugram)', oldId:'66364047c2a9e090b94bec49'},
  {key:'A-BLR',type:'aqi',label:'Bengaluru (+Gurugram)', oldId:'66a76c1b6fc06c70f73f7289'},
  {key:'A-MUM',type:'aqi',label:'Mumbai', oldId:'65127f1c88ae104c1c6250cd'},
];
const {browser,token}=await loginNew();
const oldList=JSON.parse(fs.readFileSync(OUT+'/explore/old-widgets.json','utf8'));
const created=[];
for(const p of PAIRS){
  const oldWidget=oldList.find(o=>o.id===p.oldId);
  // pull the old config (data+faceId) from the old readPublic sample when it exists, else from the old CMS list
  let data, faceId=1;
  const f=S+'old-'+p.oldId+'.json';
  const raw=JSON.parse(fs.readFileSync(OUT+'/explore/old-widget-lists.raw.json','utf8'));
  const doc=Object.values(raw).flatMap(v=>v.docs||[]).find(d=>d.id===p.oldId);
  data=doc.data; try{ faceId=Number(JSON.parse(fs.readFileSync(f,'utf8')).faceId)||1 }catch{}
  const name='QA_CMP_'+p.key;
  const r=await api('POST',NEW_API+'/v3/cms/widget/create',token,{name,data,type:p.type,faceId,faceUrl:'/media/widgets/'+p.type+'.png'});
  console.log(p.key,'create',r.status,r.text.slice(0,80));
  p.name=name; p.data=data; p.faceId=faceId; p.createStatus=r.status; created.push(p);
}
await sleep(1500);
for(const p of created){ const r=await api('GET',NEW_API+'/v3/cms/widget/read?page=1&limit=50&type='+p.type+'&search='+p.name+'&sort=createdAt&order=-1&folderId=',token); const m=(r.json?.docs||[]).filter(d=>d.name===p.name); p.newId=m[0]?.id; p.dupCount=m.length; console.log(p.key,'newId',p.newId,'matches',m.length); }
fs.writeFileSync(OUT+'/pairs.json',JSON.stringify(created,null,1));
await browser.close();
