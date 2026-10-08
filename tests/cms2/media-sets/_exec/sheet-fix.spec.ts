// Re-run of sheet cases that were Not Run / too shallow: FILE-01, RATIO-03/04/05/08, E2E-06. Verdicts via rec.ts.
import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { run, fail, observed } from './rec';

test.describe.configure({ mode: 'serial' });
const tiles = (p: Page) => p.locator('[draggable="true"]:visible');
const bodyText = async (p: Page) => (await p.locator('main, #root').first().innerText()).replace(/\n+/g, ' | ');
const zonesOf = async (p: Page) => (await bodyText(p)).match(/(Landscape|Portrait|Square) · \d+:\d+/g) ?? [];

test('sheet — re-run', async ({ mediaSetsPage: m, mediaSetApi: api, page }, testInfo) => {
  test.setTimeout(500_000);
  const files = await api.pickZoneFiles();
  const http = api['http'];
  const tag = mediaSetName('fx', testInfo.workerIndex);
  const read = async (id: string) => (await http.rawGet(`/mediaSet/read/${id}`)).json();
  const labels = (d: any) => d.zones.map((z: any) => `${z.label}${z.ratio ? ' ' + z.ratio : ''}`).join(',');
  const open = async () => { await m.open(); await m.openCreate(); await page.waitForTimeout(1500); };
  const changeRatio = async (zoneIdx: number, kind: string, ratio: string) => {
    await page.getByRole('button', { name: /change ratio/i }).nth(zoneIdx).click();
    await page.getByRole('button', { name: new RegExp(`^${kind}$`, 'i') }).first().click();
    await page.getByText(ratio, { exact: true }).first().click();
    await page.waitForTimeout(1200);
  };
  const addFormat = async (ratio: string) => {
    await page.getByText(/add display format/i).first().click();
    await page.getByText(ratio, { exact: true }).last().locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]').locator('input[type=checkbox]').check({ force: true });
    await page.getByRole('button', { name: /^apply/i }).click();
    await page.waitForTimeout(1200);
  };
  const edit = async (name: string) => { await m.open(); await m.searchAndSettle(name, 1); await m.openEdit(name); await page.waitForTimeout(2000); };

  try {
    await run('MS-FILE-01', async () => {
      await open(); await m.filterFiles('all'); await page.waitForTimeout(2000);
      const txt = await tiles(page).first().innerText();
      const textAll = await bodyText(page);
      const fname = (textAll.match(/[\w.\-]+\.(mp4|png|jpe?g|webp|mov|gif)/i) ?? txt.match(/[\w.\-]+\.\w{3,4}/))?.[0] ?? '';
      expect(fname).not.toBe('');
      await m.searchFiles(fname); await page.waitForTimeout(2500);
      const after = await bodyText(page);
      await m.cancelCreate().catch(() => {});
      if (!after.includes(fname)) return fail(`exact name "${fname}" typed in file search; the file is not in the results`);
      const count = after.split(fname).length - 1;
      return `exact name "${fname}" → file shown (${count} occurrence(s) in results)`;
    });

    await run('MS-RATIO-03', async () => {
      await open();
      const before = await zonesOf(page);
      await changeRatio(0, 'portrait', '9:20');
      const after = await zonesOf(page);
      await m.cancelCreate().catch(() => {});
      if (!after.some((z) => /Portrait · 9:20/.test(z)) || after.some((z) => /Landscape/.test(z))) return fail(`Landscape → Portrait: ${before.join(' + ')} became ${after.join(' + ')}`);
      return `Change ratio on the Landscape format → Portrait 9:20: ${before.join(' + ')} → ${after.join(' + ')}`;
    });
    await run('MS-RATIO-04', async () => {
      await open();
      await changeRatio(1, 'landscape', '20:9');
      const after = await zonesOf(page);
      await m.cancelCreate().catch(() => {});
      if (!after.some((z) => /Landscape · 20:9/.test(z)) || after.some((z) => /Portrait/.test(z))) return fail(`Portrait → Landscape: now ${after.join(' + ')}`);
      return `Change ratio on the Portrait format → Landscape 20:9: now ${after.join(' + ')}`;
    });
    await run('MS-RATIO-05', async () => {
      const name = `${tag}_r05`;
      const id = await api.create(MediaSetService.payload(name, files));
      await edit(name);
      await changeRatio(0, 'landscape', '20:9');
      await m.saveChangesBtn.click(); await page.waitForTimeout(3500);
      const d = await read(id);
      await page.reload(); await edit(name);
      const z = await zonesOf(page);
      await m.cancelBtn.click().catch(() => {});
      if (!z.some((x) => /20:9/.test(x))) return fail(`saved ratio did not persist: API zones [${labels(d)}], reopened UI ${z.join(' + ')}`);
      return `ratio changed to 20:9 → saved (API zones ${labels(d)}) → refresh + reopen shows ${z.join(' + ')}`;
    });
    await run('MS-RATIO-08', async () => {
      await open();
      const seq: string[] = [`start ${(await zonesOf(page)).join(' + ')}`];
      await addFormat('20:9'); seq.push(`+custom 20:9 → ${(await zonesOf(page)).join(' + ')}`);
      await changeRatio(0, 'portrait', '9:20'); const z = await zonesOf(page); seq.push(`Landscape→Portrait 9:20 → ${z.join(' + ')}`);
      await m.cancelCreate().catch(() => {});
      if (z.filter((x) => /16:9/.test(x)).length) return fail(`stale 16:9 retained: ${seq.join(' | ')}`);
      return `no stale ratio carried over: ${seq.join(' | ')}`;
    });

    await run('MS-E2E-06', async () => {
      const name = `${tag}_e06`;
      const id = await api.create(MediaSetService.payload(name, files));
      await edit(name);
      await m.nameInput.fill(`${name}_v2`);
      await changeRatio(0, 'landscape', '20:9');
      await m.saveChangesBtn.click(); await page.waitForTimeout(3500);
      await page.reload();
      const d = await read(id);
      const renamed = String(d.name).endsWith('_v2');
      const has = labels(d).includes('20:9');
      if (!renamed || !has) return fail(`after edit → rename → ratio 20:9 → save → refresh: renamed=${renamed}, zones [${labels(d)}]`);
      return observed(`create → edit → rename → ratio 20:9 → save → refresh: all changes persist (zones ${labels(d)}). "Clear selected media" part cannot be exercised — Clear Media clears the whole set (MS-CLEAR-01)`);
    });
  } finally {
    await api.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
