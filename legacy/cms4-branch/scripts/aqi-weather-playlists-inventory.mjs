import { chromium } from '@playwright/test';
import { login } from '../helpers/loginHelper.js';
import fs from 'fs';
const out='reports/aqi-weather-playlists';
const all=JSON.parse(fs.readFileSync(`${out}/all-playlists.json`));
const hits=all.filter(d=>(d.layouts||[]).some(l=>(l.zones||[]).some(z=>/widgets\/(aqi|weather)/i.test(z.img||''))));
const b=await chromium.launch(); const ctx=await b.newContext();
const page=await ctx.newPage(); let hdr=null;
page.on('request',r=>{if(r.url().includes('/v3/cms/playlist/read')&&!hdr)hdr=r.headers()});
await login(page); await page.goto('https://cms.pocsample.in/playlists',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(6000);
const rows=[];
for(const d of hits){
  const j=await (await ctx.request.get(`https://v3-5api.pocsample.in/v3/cms/playlist/read/${d.id}`,{headers:hdr})).json();
  (j.layouts||[]).forEach((l,li)=>(l.zones||[]).forEach((z,zi)=>{const w=z.widget; if(w&&['aqi','weather'].includes(w.type))
    rows.push({playlist:j.name,playlistId:j.id,screens:d.screens,layout:li+1,layoutDur:l.duration,zone:zi+1,widgetId:w.id,widgetName:w.name,type:w.type,data:w.data})}));
}
fs.writeFileSync(`${out}/inventory.json`,JSON.stringify(rows,null,1));
for(const r of rows)console.log(r.type.padEnd(8),r.playlist.slice(0,28).padEnd(28),'L'+r.layout+'Z'+r.zone,r.widgetName,JSON.stringify(r.type==='aqi'?r.data.cities:r.data.city));
console.log(rows.length);
await b.close();
