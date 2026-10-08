// Deletes ONLY the QA_CMP_* mirror widgets this run created on cms.pocsample.in (ids from pairs.json). Never touches cms.wilyersignage.com.
import fs from 'fs';
import { OUT, NEW_API, loginNew, api, sleep } from './common.mjs';

const pairs = JSON.parse(fs.readFileSync(OUT + '/pairs.json', 'utf8'));
const { browser, token } = await loginNew();
const log = [];
for (const p of pairs) {
  if (!p.newId || !/^QA_CMP_/.test(p.name)) { log.push({ key: p.key, skipped: 'no id or name not QA_CMP_' }); continue; }
  const r = await api('DELETE', `${NEW_API}/v3/cms/widget/delete/${p.newId}`, token);
  log.push({ key: p.key, id: p.newId, status: r.status, message: r.json?.message });
  await sleep(300);
}
await sleep(1500);
const left = [];
for (const type of ['weather', 'aqi']) {
  const r = await api('GET', `${NEW_API}/v3/cms/widget/read?page=1&limit=50&type=${type}&search=QA_CMP_&sort=createdAt&order=-1&folderId=`, token);
  left.push(...(r.json?.docs || []).filter(d => /^QA_CMP_/.test(d.name)).map(d => d.name));
}
fs.writeFileSync(OUT + '/cleanup-results.json', JSON.stringify({ deleted: log, remainingQA_CMP: left }, null, 1));
console.log(JSON.stringify({ deleted: log.map(l => l.status), remaining: left }));
await browser.close();
