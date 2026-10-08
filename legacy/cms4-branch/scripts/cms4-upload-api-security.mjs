// CMS4 upload/conversion API security + negative tests, direct HTTP (not via UI).
// Auth: log in once via headless browser, extract cookies, reuse with fetch.
// Usage: CMS4_USER=... CMS4_PASS=... node scripts/cms4-upload-api-security.mjs
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const base = process.env.CMS4_BASE || 'https://cms4.pocsample.in';
const results = [];
function log(id, severity, summary, detail) {
  results.push({ id, severity, summary, detail });
  console.log(`[${severity}] ${id}: ${summary}`);
}

const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
let api = null; let capturedHeaders = null;
p.on('request', r => {
  if (/\/v3\/cms\//.test(r.url())) {
    if (!api) api = r.url().split('/v3/')[0];
    if (!capturedHeaders && /\/file\/(read|stats)/.test(r.url())) capturedHeaders = r.headers();
  }
});
await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
await p.locator('input[type=email],input[name*=mail i],input[type=text]').first().fill(process.env.CMS4_USER);
await p.locator('input[type=password]').first().fill(process.env.CMS4_PASS);
await p.locator('button[type=submit],button:has-text("Login"),button:has-text("Sign in")').first().click();
await p.waitForTimeout(6000);
await p.goto(base + '/library', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
const cookies = await ctx.cookies();
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const storage = await p.evaluate(() => ({ ...localStorage }));
const session = await p.evaluate(() => ({ ...sessionStorage }));
console.log('api base:', api, '| cookie names:', cookies.map(c => c.name).join(','), '| localStorage keys:', Object.keys(storage).join(','), '| sessionStorage keys:', Object.keys(session).join(','));
console.log('captured auth headers from real request:', capturedHeaders ? Object.keys(capturedHeaders).filter(k => /auth|token|cookie|footprint/i.test(k)).map(k => `${k}=${capturedHeaders[k].slice(0, 60)}`).join(' | ') : 'NONE CAPTURED');
await b.close();

const H = { 'content-type': 'application/json' };
if (capturedHeaders) {
  for (const k of Object.keys(capturedHeaders)) if (/auth|token|cookie|footprint/i.test(k)) H[k] = capturedHeaders[k];
}
if (!H.cookie) H.cookie = cookieHeader;

// ---- A: sign-part object-key ownership check (does it sign a PUT for an arbitrary key?) ----
{
  const foreignKey = `v3/000000000000000000000000/pwn-${Date.now()}.mp4`;
  const r = await fetch(`${api}/v3/cms/file/uppy/sign-part?uploadId=nonexistent-upload-id&key=${encodeURIComponent(foreignKey)}&partNumber=1`, { headers: H });
  const body = await r.text();
  if (r.status === 200 && /url/.test(body)) {
    log('UPLOAD-SEC-01', 'HIGH', 'sign-part issues a presigned PUT for an arbitrary key/uploadId without validating ownership',
      { status: r.status, requestedKey: foreignKey, body: body.slice(0, 300) });
  } else {
    log('UPLOAD-SEC-01', 'INFO', 'sign-part rejected an arbitrary key/uploadId', { status: r.status, body: body.slice(0, 300) });
  }
}

// ---- B: finalize replay / idempotency (does re-POSTing finalize on the same key create a duplicate doc?) ----
{
  // Use a real key from a tiny prior upload if available, else skip with note
  log('UPLOAD-SEC-02', 'INFO', 'finalize replay test requires a completed uploadId/key from a real multipart upload; run via cms4-video-matrix.mjs then replay finalize manually', {});
}

// ---- C: unauthenticated access to upload endpoints ----
{
  const r = await fetch(`${api}/v3/cms/file/uppy/create-multipart-upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'x.mp4', type: 'video/mp4' }) });
  const body = await r.text();
  if (r.status < 400) {
    log('UPLOAD-SEC-03', 'HIGH', 'create-multipart-upload accepted a request with no auth cookie', { status: r.status, body: body.slice(0, 300) });
  } else {
    log('UPLOAD-SEC-03', 'INFO', 'create-multipart-upload correctly rejected unauthenticated request', { status: r.status, body: body.slice(0, 200) });
  }
}

// ---- D: finalize with mismatched / oversized client metadata (trust boundary) ----
{
  const r = await fetch(`${api}/v3/cms/file/uppy/finalize`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ key: `v3/fake/${Date.now()}.mp4`, clientWidth: 99999, clientHeight: 99999, clientDuration: 999999, name: 'spoof.mp4' })
  });
  const body = await r.text();
  log('UPLOAD-SEC-04', r.status < 300 ? 'MEDIUM' : 'INFO',
    r.status < 300 ? 'finalize accepted a nonexistent S3 key with spoofed metadata' : 'finalize rejected nonexistent key',
    { status: r.status, body: body.slice(0, 300) });
}

// ---- E: path traversal / special chars in filename ----
{
  const evilNames = ['../../etc/passwd.mp4', '..\\..\\windows\\win.ini.mp4', '<script>alert(1)</script>.mp4', 'a'.repeat(500) + '.mp4', 'con.mp4', 'nul.mp4'];
  for (const name of evilNames) {
    const r = await fetch(`${api}/v3/cms/file/uppy/create-multipart-upload`, { method: 'POST', headers: H, body: JSON.stringify({ filename: name, type: 'video/mp4' }) });
    const body = await r.text();
    const reflected = body.includes(name) || body.includes(encodeURIComponent(name));
    log('UPLOAD-SEC-05:' + name.slice(0, 20), r.status < 300 ? (reflected ? 'LOW' : 'INFO') : 'INFO',
      `filename "${name.slice(0, 40)}" -> ${r.status}`, { status: r.status, body: body.slice(0, 250) });
  }
}

// ---- F: zero-byte and empty filename ----
{
  const r = await fetch(`${api}/v3/cms/file/uppy/create-multipart-upload`, { method: 'POST', headers: H, body: JSON.stringify({ filename: '', type: 'video/mp4' }) });
  log('UPLOAD-SEC-06', r.status < 300 ? 'LOW' : 'INFO', `empty filename -> ${r.status}`, { status: r.status, body: (await r.text()).slice(0, 200) });
}

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/cms4-upload-api-security.json', JSON.stringify(results, null, 2));
console.log('\n--- summary ---');
for (const r of results) console.log(r.severity.padEnd(6), r.id, r.summary);
