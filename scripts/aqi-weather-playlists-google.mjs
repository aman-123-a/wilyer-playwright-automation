import { chromium } from '@playwright/test';
import fs from 'fs';
const out='reports/aqi-weather-playlists';
const jobs=[];
for(const c of ['Hyderabad','Chennai','Kolkata','Telangana'])jobs.push(['aqi',c,`${c} AQI today`]);
for(const c of ['Mumbai','New Delhi','Chennai','Kolkata'])jobs.push(['weather',c,`${c} weather today`]);
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900},locale:'en-IN',timezoneId:'Asia/Kolkata'});
const res=[];
for(const [type,city,q] of jobs){
  const page=await ctx.newPage();
  await page.goto('https://www.google.com/search?hl=en&gl=in&q='+encodeURIComponent(q),{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(3500);
  const consent=page.getByRole('button',{name:/accept all|i agree/i}); if(await consent.count())await consent.first().click().catch(()=>{});
  const txt=(await page.locator('body').innerText()).slice(0,1500);
  const file=`${out}/shots/google-${type}-${city.replace(/ /g,'_')}.png`;
  await page.screenshot({path:file});
  res.push({type,city,q,ts:new Date().toISOString(),captcha:/unusual traffic|captcha/i.test(txt)||/sorry/.test(page.url()),txt:txt.slice(0,600),file});
  console.log(type,city,res.at(-1).captcha,'\n',txt.slice(0,350).replace(/\n+/g,' | '));
  await page.close();
}
fs.writeFileSync(`${out}/google-ref.json`,JSON.stringify(res,null,1));
await b.close();
