import { NEW_API, loginNew, api } from './common.mjs';
const { browser, token } = await loginNew();
const left = [];
for (const type of ['aqi', 'weather']) {
  for (const q of ['QA_CMP_', 'QA_CMP']) {
    const r = await api('GET', `${NEW_API}/v3/cms/widget/read?page=1&limit=50&type=${type}&search=${q}&sort=createdAt&order=-1&folderId=`, token);
    for (const d of r.json?.docs || []) if (/^QA_CMP/.test(d.name) && !left.find(x => x.id === d.id)) left.push({ id: d.id, name: d.name, type });
  }
}
console.log('LEFTOVER', JSON.stringify(left));
await browser.close();
