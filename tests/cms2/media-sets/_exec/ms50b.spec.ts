// Re-run of the three MS-0xx cases whose first verdict was a script problem (MS-027, MS-028, MS-050).
import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { run, fail, observed } from './rec';

test.describe.configure({ mode: 'serial' });
const body = async (p: Page) => (await p.locator('main, #root').first().innerText()).replace(/\n+/g, ' | ');

test('MS-027 / MS-028 / MS-050 re-run', async ({ mediaSetsPage: ms, mediaSetApi: api, page }, testInfo) => {
  test.setTimeout(400_000);
  const files = await api.pickZoneFiles();
  const http = api['http'];
  const tag = mediaSetName('m50b', testInfo.workerIndex);
  const mk = (n: string, x: object = {}) => ({ ...MediaSetService.payload(n, files), ...x });
  const made: string[] = [];
  const doc = async (id: string) => (await http.rawGet(`/mediaSet/read/${id}`)).json();
  const filled = (d: { zones: Array<{ file: unknown }> }) => d.zones.filter((z) => z.file).length;
  const dialogs: string[] = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss().catch(() => {}); });
  await page.addInitScript(() => { (window as unknown as { __xss: number }).__xss = 0; });

  try {
    await run('MS-027', async () => {
      const n = `${tag}_027`;
      const id = await api.create(mk(n)); made.push(id);
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      // 1) remove the FILE from the Portrait format (small × on the preview)
      const portraitCard = page.locator('xpath=(//*[contains(normalize-space(.),"Portrait · 9:16")])[last()]/ancestor::div[.//button[@title="Remove format" or @aria-label="Remove format"]][1]');
      const fileX = portraitCard.locator('button:has(i.bi-x), button:has(i.bi-x-lg)').filter({ hasNot: page.locator('[aria-label="Remove format"], [title="Remove format"]') });
      const nFileX = await fileX.count();
      let step1 = 'file-remove × not found';
      if (nFileX) {
        await fileX.first().click();
        await page.waitForTimeout(700);
        await ms.saveChangesBtn.click();
        await page.waitForTimeout(3000);
        const d = await doc(id);
        const msg = (await body(page)).match(/at least[^|]{0,70}|must[^|]{0,60}|required[^|]{0,40}/i)?.[0] ?? '';
        step1 = `× on the Portrait file then Save → ${msg ? `UI message "${msg.trim()}"` : 'no message'}; stored formats with a file: ${filled(d)}/2`;
        await page.reload();
      }
      // 2) remove a whole FORMAT
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      const rm = page.locator('button[title="Remove format"], button[aria-label="Remove format"]');
      const nRm = await rm.count();
      let step2 = '"Remove format" not found';
      if (nRm) {
        await rm.last().click();
        await page.waitForTimeout(700);
        await ms.saveChangesBtn.click();
        await page.waitForTimeout(3000);
        const d = await doc(id);
        const msg = (await body(page)).match(/at least[^|]{0,70}|minimum[^|]{0,60}|2 (display )?formats[^|]{0,40}/i)?.[0] ?? '';
        step2 = `"Remove format" on Portrait then Save → ${msg ? `UI message "${msg.trim()}"` : 'no message'}; stored zones: ${d.zones.length}`;
        if (d.zones.length < 2) return fail(`${step1}; ${step2} — a set with fewer than 2 formats was stored (API refuses this on create)`);
      }
      return `${step1}; ${step2}`;
    });

    await run('MS-028', async () => {
      const n = `${tag}_028`;
      const id = await api.create(mk(n)); made.push(id);
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      await page.getByRole('button', { name: /clear media/i }).click();
      await page.waitForTimeout(600);
      const conf = page.locator('.modal.show');
      const confText = (await conf.isVisible().catch(() => false)) ? (await conf.innerText()).replace(/\n+/g, ' | ') : '';
      if (confText) await conf.getByRole('button', { name: /clear|yes|confirm|ok/i }).first().click();
      const emptySlots = (await body(page)).match(/click a file on the left/gi)?.length ?? 0;
      await ms.saveChangesBtn.click();
      await page.waitForTimeout(3000);
      const d = await doc(id);
      const toast = (await body(page)).match(/(?:select|add|choose|assign|at least|cannot|unable)[^|]{0,80}/i)?.[0] ?? '';
      await page.screenshot({ path: 'test-results/ms028-after-save.png' });
      const stillEdit = await ms.saveChangesBtn.isVisible().catch(() => false);
      const base = `Clear Media${confText ? ` (confirm: "${confText.slice(0, 60)}")` : ' (no confirmation)'} left ${emptySlots} empty slot(s); Save Changes → stored formats with a file: ${filled(d)}/${d.zones.length}; still on edit screen=${stillEdit}`;
      if (filled(d) === 0) return fail(`${base} — an empty set was stored`);
      return observed(`${base}; ${toast ? `message "${toast}"` : 'no message explaining why the save did nothing'}`);
    });

    await run('MS-050', async () => {
      const payloads = ['<img src=x onerror="window.__xss=1">', '"><svg/onload=window.__xss=1>', '<script>window.__xss=1</script>'];
      for (const [i, p] of payloads.entries()) {
        const r = await api.createRaw(mk('', { name: `${tag}_xss${i}_${p}`, description: p }));
        expect(r.status()).toBe(201);
        made.push((await r.json()).id);
      }
      await ms.open();
      await ms.search(`${tag}_xss`);
      await page.waitForTimeout(1500);
      await ms.expectTotal(3);
      const names: string[] = await ms.cards().evaluateAll((e) => e.map((x) => x.querySelector('.fw-semibold')?.textContent ?? ''));
      const first = ms.cards().first();
      await first.locator('button.bg-red-500').click();
      const del = await ms.openModal.innerText(); await ms.cancelModal();
      await first.locator('input[type="checkbox"]').check();
      await ms.bulkMoveBtn.click();
      const mv = await ms.openModal.innerText(); await ms.cancelModal();
      await first.locator('input[type="checkbox"]').uncheck();
      await first.locator('button.bg-orange-500').click();
      await page.waitForTimeout(2500);
      const val = await ms.nameInput.inputValue().catch(() => '');
      const desc = await page.getByPlaceholder(/description/i).first().inputValue().catch(() => '');
      const flag = await page.evaluate(() => (window as unknown as { __xss: number }).__xss);
      const injected = await page.locator('main img[src="x"], main svg[onload], main script:not([src])').count();
      expect(names.every((t) => /[<"]/.test(t)), `card titles hold the payload as text: ${names.join(' / ').slice(0, 120)}`).toBe(true);
      expect(del).toContain('<');
      expect(mv).toContain('<');
      expect(val).toContain('<');
      expect(dialogs, 'no alert dialog').toHaveLength(0);
      expect(flag, 'window.__xss untouched').toBe(0);
      expect(injected, 'no injected element').toBe(0);
      return `3 XSS payloads (img onerror, svg onload, script tag) in name and description render as literal text on the cards, in the delete modal, the Move modal and the edit fields (name + description "${desc.slice(0, 20)}…"); no script ran (window flag 0), no dialog, no injected DOM`;
    });
  } finally {
    for (const id of made) await api.deleteQuietly(id);
    await api.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
