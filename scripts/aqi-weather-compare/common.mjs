import { chromium } from '@playwright/test';
import fs from 'fs';
export const OUT = 'reports/aqi-weather-api-comparison';
export const OLD_API = 'https://v3-5api.wilyersignage.com';
export const NEW_API = 'https://v3-5api.pocsample.in';
export const OLD_WIDGET_HOST = 'https://widgets.signagecloud.in';
export const NEW_WIDGET_HOST = 'https://widget-test.signagecloud.in';
export const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1).trim()]));
export const sleep = ms => new Promise(r=>setTimeout(r,ms));
export function stats(a){ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); const q=p=>s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)];
  const avg=a.reduce((x,y)=>x+y,0)/a.length; return {n:a.length,min:s[0],max:s[s.length-1],avg:+avg.toFixed(1),median:+((s[(s.length-1)>>1]+s[s.length>>1])/2).toFixed(1),p90:q(90),p95:q(95),p99:q(99)}; }
export async function timedGet(url, headers={}){ const t=performance.now(); try{ const r=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}); const buf=await r.arrayBuffer(); return {url,status:r.status,ms:+(performance.now()-t).toFixed(1),bytes:buf.byteLength,body:Buffer.from(buf).toString('utf8')}; }catch(e){ return {url,status:0,ms:+(performance.now()-t).toFixed(1),bytes:0,body:'',error:e.name+': '+e.message}; } }
// Logs in to the NEW cms (pocsample) with the local .env account; returns {browser,context,page,token}
export async function loginNew(){
  const browser=await chromium.launch(); const context=await browser.newContext({viewport:{width:1440,height:900}}); const page=await context.newPage();
  let token=null; page.on('request',r=>{ const a=r.headers()['authorization']; if(a&&r.url().startsWith(NEW_API)) token=a; });
  await page.goto('https://cms.pocsample.in',{waitUntil:'domcontentloaded'});
  await page.getByRole('textbox',{name:/email|phone/i}).fill(env.CMS_ADMIN_EMAIL);
  await page.getByRole('textbox',{name:/password/i}).fill(env.CMS_ADMIN_PASSWORD);
  await page.getByRole('button',{name:/log in/i}).click();
  await page.waitForFunction(()=>/Library/.test(document.body.innerText),null,{timeout:60000}); await sleep(4000); token=null; await page.goto('https://cms.pocsample.in/library',{waitUntil:'domcontentloaded'}); for(let i=0;i<60&&!token;i++) await sleep(500);
  if(!token) throw new Error('no auth token captured');
  return {browser,context,page,token};
}
export const api = async (method,url,token,body) => { const r=await fetch(url,{method,headers:{authorization:token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}); const t=await r.text(); let j; try{j=JSON.parse(t)}catch{} return {status:r.status,json:j,text:t}; };
