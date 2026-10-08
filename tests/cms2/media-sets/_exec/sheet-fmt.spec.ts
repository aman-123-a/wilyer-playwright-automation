// Sheet cases that depend on "Add Display Format" (preset aspect-ratio picker). Verdicts via rec.ts.
import type { Page } from '@playwright/test';
import { test } from '../../../../fixtures/test-fixtures';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { run, fail, observed } from './rec';

test.describe.configure({ mode: 'serial' });
const tiles = (p: Page) => p.locator('[draggable="true"]:visible');
const bodyText = async (p: Page) => (await p.locator('main, #root').first().innerText()).replace(/\n+/g, ' | ');
const tick20 = (p: Page) => p.getByText('20:9', { exact: true }).last().locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]').locator('input[type=checkbox]').check({ force: true });

test('sheet — display format cases', async ({ mediaSetsPage: m, mediaSetApi: api, page }, testInfo) => {
  test.setTimeout(400_000);
  const tag = mediaSetName('fmt', testInfo.workerIndex);
  const open = async () => { await m.open(); await m.openCreate(); await m.filterFiles('images'); await page.waitForTimeout(1500); };
  const openPicker = async () => { await page.getByText(/add display format/i).first().click(); await page.getByRole('button', { name: /^apply/i }).waitFor(); };
  const zones = async () => (await bodyText(page)).match(/\b\d+:\d+\b/g) ?? ([] as string[]);
  try {
    await run('MS-RATIO-06', async () => {
      await open();
      const before = await zones();
      await openPicker();
      await tick20(page);
      const applyTxt = await page.getByRole('button', { name: /^apply/i }).innerText();
      await page.getByRole('button', { name: /^apply/i }).click();
      await page.waitForTimeout(1500);
      const after = await zones();
      await m.cancelCreate().catch(() => {});
      if (!after.includes('20:9')) return fail(`20:9 selected + "${applyTxt}" but no 20:9 format appeared (formats before: ${[...new Set(before)].join(',')})`);
      return `picked 20:9 from preset list, "${applyTxt}" → new 20:9 format added to the builder (formats now ${[...new Set(after)].join(',')})`;
    });
    await run('MS-RATIO-07', async () => {
      await open(); await openPicker();
      const dis = await page.getByRole('button', { name: /^apply/i }).isDisabled();
      let added = false;
      if (!dis) { await page.getByRole('button', { name: /^apply/i }).click(); await page.waitForTimeout(800); added = true; }
      await page.keyboard.press('Escape').catch(() => {});
      await m.cancelCreate().catch(() => {});
      return observed(`no free-text width/height exists (preset ratios only). Apply with nothing selected: button ${dis ? 'DISABLED — nothing invalid can be saved' : 'enabled; clicking it ' + (added ? 'closed the dialog' : '')}`);
    });
    await run('MS-E2E-05', async () => {
      await open();
      const name = `${tag}_e05`;
      await m.nameInput.fill(name);
      await openPicker();
      await tick20(page);
      await page.getByRole('button', { name: /^apply/i }).click();
      await page.waitForTimeout(1500);
      // assign first available image to the 20:9 zone then save
      const zone = page.getByText(/20:9/).first();
      await zone.click(); await tiles(page).first().click(); await page.waitForTimeout(600);
      for (const [zoneText, kind] of [[/16:9 media/i, 'l'], [/9:16 media/i, 'p']] as const) {
        const metas = await tiles(page).evaluateAll((e) => e.map((x) => x.querySelector('.msce-hover-meta')?.textContent ?? ''));
        const idx = metas.findIndex((t) => { const r = t.match(/(\d+)×(\d+)/); return r && (kind === 'l' ? +r[1] > +r[2] : +r[2] > +r[1]); });
        await page.getByText(zoneText).first().click(); await tiles(page).nth(idx).click(); await page.waitForTimeout(600);
      }
      await page.getByRole('button', { name: /^create$/i }).click(); await page.waitForTimeout(4000);
      const d: any = await api.findByName(name);
      if (!d) return fail(`set with an added 20:9 format was not saved; page: ${(await bodyText(page)).slice(0, 160)}`);
      const labels = d.zones.map((z: any) => `${z.label}${z.ratio ? ' ' + z.ratio : ''}`).join(',');
      await m.open(); await m.searchAndSettle(name, 1); await m.openEdit(name); await page.waitForTimeout(2000);
      const has = (await zones()).includes('20:9');
      await m.cancelBtn.click().catch(() => {});
      if (!has) return fail(`saved zones [${labels}] but reopening the set does not show the 20:9 format`);
      return `added 20:9 → saved (zones: ${labels}) → reopened in Edit: 20:9 format persists`;
    });
    for (const id of ['MS-NEG-12', 'MS-NEG-13', 'MS-BVA-14', 'MS-BVA-15']) {
      await run(id, async () => observed('Not applicable in this build: Add Display Format is a checklist of preset ratios (Landscape/Portrait/Square). There is no width/height input, so zero/negative/min-boundary values cannot be entered'));
    }
  } finally {
    await api.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
