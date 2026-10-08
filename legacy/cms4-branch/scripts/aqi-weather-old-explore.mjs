import { chromium } from '@playwright/test';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1).trim()]));
const out='reports/aqi-weather-api-comparison/explore'; fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch(); const page=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const got={};
page.on('response',async r=>{ if(/widget\/read\?/.test(r.url())&&r.status()===200){ try{ const j=await r.json(); const u=new URL(r.url()); got[u.searchParams.get('type')+'|p'+u.searchParams.get('page')]=j; }catch{} } });
await page.goto(env.CMS_OLD_URL,{waitUntil:'domcontentloaded'});
await page.getByRole('textbox',{name:/email|phone/i}).fill(env.CMS_OLD_EMAIL);
await page.getByRole('textbox',{name:/password/i}).fill(env.CMS_OLD_PASSWORD);
await page.getByRole('button',{name:/log in/i}).click();
await page.waitForTimeout(8000);
for (const [label,type] of [['AQI','aqi'],['Weather','weather']]) {
  await page.goto(env.CMS_OLD_URL+'/library',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>/Widgets \(/.test(document.body.innerText),null,{timeout:60000});
  await page.getByText(/^Widgets \(\d+\)$/).first().click(); await page.waitForTimeout(2500);
  await page.getByText(new RegExp('^'+label+' [(][0-9]+[)]$')).first().click(); await page.waitForTimeout(5000);
  await page.screenshot({path:out+'/old-'+type+'-list.png',fullPage:true});
}
fs.writeFileSync(out+'/old-widget-lists.raw.json',JSON.stringify(got));
for (const [k,v] of Object.entries(got)) console.log(k,'topkeys',Object.keys(v).join(','), JSON.stringify(v).slice(0,400));
await b.close();
