import { chromium } from '@playwright/test';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1).trim()]));
const out='reports/aqi-weather-api-comparison/explore';
const b=await chromium.launch(); const page=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const calls=[]; page.on('request',r=>{ if(/widget\/(create|update)/.test(r.url())) calls.push(r.method()+' '+r.url()+' '+(r.postData()||'').slice(0,500)) });
await page.goto('https://cms.pocsample.in',{waitUntil:'domcontentloaded'});
await page.getByRole('textbox',{name:/email|phone/i}).fill(env.CMS_ADMIN_EMAIL);
await page.getByRole('textbox',{name:/password/i}).fill(env.CMS_ADMIN_PASSWORD);
await page.getByRole('button',{name:/log in/i}).click();
await page.waitForTimeout(8000);
await page.goto('https://cms.pocsample.in/library',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>/Widgets \(/.test(document.body.innerText),null,{timeout:60000});
await page.getByText(/^Widgets [(][0-9]+[)]$/).first().click(); await page.waitForTimeout(2500);
for (const label of ['Weather','AQI']) {
  await page.getByText(new RegExp('^'+label+' [(][0-9]+[)]$')).first().click(); await page.waitForTimeout(3000);
  await page.getByRole('button',{name:/add new/i}).click(); await page.waitForTimeout(2000);
  await page.screenshot({path:out+'/new-'+label+'-form.png'});
  const d=page.getByRole('dialog');
  console.log(label,'FORM:',(await d.innerText()).replace(/\n+/g,' | ').slice(0,500));
  console.log(await d.locator('input,select,textarea,button').evaluateAll(els=>els.map(e=>e.tagName+':'+(e.type||'')+':'+(e.name||e.id||e.placeholder||e.innerText||'').trim().slice(0,40)).join(' ; ')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.goto('https://cms.pocsample.in/library',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>/Widgets \(/.test(document.body.innerText),null,{timeout:60000});
  await page.getByText(/^Widgets [(][0-9]+[)]$/).first().click(); await page.waitForTimeout(2500);
}
await b.close();
