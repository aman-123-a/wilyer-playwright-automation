import { chromium } from '@playwright/test';
import fs from 'fs';
const base='https://cms4.pocsample.in';
const b=await chromium.launch(); const p=await b.newPage();
let hdr=null, api=null;
p.on('request',r=>{if(/\/v3\/cms\/file\/read/.test(r.url())&&!hdr){hdr=r.headers();api=r.url().split('/v3/')[0];}});
await p.goto(base+'/',{waitUntil:'domcontentloaded'});
await p.locator('input[type=email],input[name*=mail i],input[type=text]').first().fill(process.env.CMS4_USER);
await p.locator('input[type=password]').first().fill(process.env.CMS4_PASS);
await p.locator('button[type=submit],button:has-text("Login"),button:has-text("Sign in")').first().click();
await p.waitForTimeout(5000); await p.goto(base+'/library',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(5000);
const h={}; for(const k of ['authorization','token','x-auth-token','cookie']) if(hdr?.[k]) h[k]=hdr[k];
const docs=[];
for(let pg=1;pg<=8;pg++){
  const r=await p.request.get(`${api}/v3/cms/file/read?limit=100&search=sample_&page=${pg}&type=&sort=createdAt&order=-1&folderId=`,{headers:h});
  const j=await r.json(); if(!j.docs?.length) break; docs.push(...j.docs);
}
fs.writeFileSync('reports/cms4-library-docs.json',JSON.stringify(docs,null,1));
console.log(docs.length, JSON.stringify(docs[0]).slice(0,900));
await b.close();
