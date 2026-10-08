// CMS4 video upload/conversion matrix: 11 formats x 5 resolutions (filesamples.com).
// Usage: CMS4_USER=... CMS4_PASS=... node scripts/cms4-video-matrix.mjs [fmt,fmt] [res,res]
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const base = process.env.CMS4_BASE || 'https://cms4.pocsample.in';
const dir = path.resolve('data/cms4-video-samples');
const fmts = (process.argv[2] || '3gp,avi,flv,mkv,mov,mp4,mpeg,mpg,vob,webm,wmv').split(',');
const ress = (process.argv[3] || '640x360,1280x720,1920x1080,2560x1440,3840x2160').split(',');
const LIMIT_MS = 10 * 60 * 1000;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
await p.locator('input[type=email],input[name*=mail i],input[type=text]').first().fill(process.env.CMS4_USER);
await p.locator('input[type=password]').first().fill(process.env.CMS4_PASS);
await p.locator('button[type=submit],button:has-text("Login"),button:has-text("Sign in")').first().click();
await p.waitForTimeout(6000);

const rows = [];
for (const fmt of fmts) for (const res of ress) {
  const file = path.join(dir, `sample_${res}.${fmt}`);
  const row = { fmt, res, size: null, upload: null, library: null, ms: null, note: '' };
  rows.push(row);
  if (!fs.existsSync(file)) { row.note = 'sample missing'; continue; }
  row.size = fs.statSync(file).size;
  const net = [];
  const onResp = async r => {
    const u = r.url();
    if (/\/uppy\/(finalize|complete-multipart-upload)/.test(u)) {
      let t = ''; try { t = (await r.text()).slice(0, 160); } catch {}
      net.push(`${r.status()} ${u.split('/').pop()} ${t}`);
    }
  };
  p.on('response', onResp);
  try {
    await p.goto(base + '/library', { waitUntil: 'domcontentloaded' });
    await p.getByRole('button', { name: /upload media/i }).click({ timeout: 30000 });
    const t0 = Date.now();
    await p.locator('#uploadFileInput').setInputFiles(file);
    while (Date.now() - t0 < LIMIT_MS && !net.some(n => /finalize/.test(n))) await p.waitForTimeout(1000);
    row.ms = Date.now() - t0;
    row.upload = net.find(n => /finalize/.test(n)) || `no finalize (${net.join(' | ') || 'no api calls'})`;
    const body = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
    const err = body.match(/(unsupported|invalid|failed|error|too large|exceed)[^.]{0,80}/i);
    if (err) row.note = err[0];
    // verify the file landed in the library (server may rename extension after conversion)
    await p.goto(base + '/library', { waitUntil: 'domcontentloaded' });
    await p.getByPlaceholder('Search...').fill(`sample_${res}`);
    await p.waitForTimeout(3000);
    const cards = await p.locator('body').innerText();
    row.library = (cards.match(new RegExp(`sample_${res}[^\\n]*`, 'g')) || []).slice(0, 3);
  } catch (e) { row.note = (row.note + ' ' + e.message.split('\n')[0]).trim(); }
  p.off('response', onResp);
  console.log(JSON.stringify(row));
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/cms4-video-matrix.json', JSON.stringify(rows, null, 2));
await b.close();
