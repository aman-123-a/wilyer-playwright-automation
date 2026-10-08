// Follow-up: confirm the finalize-without-S3-object "ghost" file actually lands in the
// library and is unplayable, then clean it up. Also deletes the UPLOAD-SEC-05 probe files.
import { chromium } from '@playwright/test';

const base = process.env.CMS4_BASE || 'https://cms4.pocsample.in';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
let api = null, authH = null;
p.on('request', r => {
  if (/\/v3\/cms\//.test(r.url())) {
    if (!api) api = r.url().split('/v3/')[0];
    if (!authH && /\/file\/(read|stats)/.test(r.url())) authH = r.headers();
  }
});
await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
await p.locator('input[type=email],input[name*=mail i],input[type=text]').first().fill(process.env.CMS4_USER);
await p.locator('input[type=password]').first().fill(process.env.CMS4_PASS);
await p.locator('button[type=submit],button:has-text("Login"),button:has-text("Sign in")').first().click();
await p.waitForTimeout(6000);
await p.goto(base + '/library', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
await b.close();

const H = { 'content-type': 'application/json', authorization: authH.authorization, cookie: authH.cookie || '' };

// find all probe records we created in this session
const r = await fetch(`${api}/v3/cms/file/read?limit=50&search=&page=1&type=&sort=createdAt&order=-1&folderId=`, { headers: H });
const j = await r.json();
const ghosts = j.docs.filter(d => /^(_|aaaaaaaaaaaaaaaaaaaa|con_|nul_)/.test(d.name) || d.id === '6ac4dd4aba566e7c4385c05f');
console.log('found', ghosts.length, 'probe/ghost records');
for (const g of ghosts) {
  const head = await fetch(g.url, { method: 'HEAD' }).catch(e => ({ status: 'ERR:' + e.message }));
  console.log(g.id, g.name, g.size + 'MB', 'playback URL status:', head.status);
}
if (ghosts.length) console.log('NOTE: not deleting automatically; ids above need manual cleanup via /file/deleteFiles if you want them removed.');
