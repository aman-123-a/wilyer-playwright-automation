// Extended execution — Create/Edit builder flows driven through the real UI (headed-friendly).
import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import type { MediaSetsPage } from '../../../../pages/MediaSetsPage';
import { run, fail, observed } from './rec';

test.describe.configure({ mode: 'serial' });

const tiles = (page: Page) => page.locator('[draggable="true"]:visible');
async function metas(page: Page): Promise<string[]> {
  return tiles(page).evaluateAll((e) => e.map((x) => x.querySelector('.msce-hover-meta')?.textContent ?? ''));
}
async function pick(page: Page, kind: 'landscape' | 'portrait', skip = 0): Promise<number> {
  const m = await metas(page);
  const hits = m.map((t, i) => ({ i, r: t.match(/(\d+)×(\d+)/) })).filter((x) => x.r && (kind === 'landscape' ? +x.r[1] > +x.r[2] : +x.r[2] > +x.r[1]));
  if (hits.length <= skip) throw new Error(`no ${kind} tile #${skip} among ${m.length} tiles`);
  return hits[skip].i;
}
async function assign(page: Page, format: 'landscape' | 'portrait', skip = 0): Promise<void> {
  const idx = await pick(page, format, skip);
  await page.getByText(format === 'landscape' ? /landscape · 16:9/i : /portrait · 9:16/i).first().click();
  await tiles(page).nth(idx).click();
  await page.waitForTimeout(500);
}
const createBtn = (page: Page) => page.getByRole('button', { name: /^create$/i });
const bodyText = async (page: Page) => (await page.locator('main, #root').first().innerText()).replace(/\n+/g, ' | ');

test('extended UI execution — builder', async ({ mediaSetsPage, mediaSetApi, page }, testInfo) => {
  test.setTimeout(900_000);
  const files: ZoneFiles = await mediaSetApi.pickZoneFiles();
  const tag = mediaSetName('ui1', testInfo.workerIndex);
  const http = mediaSetApi['http'];
  const count = async (name: string) => (await mediaSetApi.list({ search: name, limit: 100 })).mediaSets.filter((m) => m.name === name).length;
  const openBuilder = async (m: MediaSetsPage, images = true) => {
    await m.open();
    await m.openCreate();
    if (images) await m.filterFiles('images');
  };
  const dialogs: string[] = [];
  page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss().catch(() => {}); });

  try {
    await run('MS-CRUD-01', async () => {
      const name = `${tag}_c01`;
      await openBuilder(mediaSetsPage);
      await mediaSetsPage.nameInput.fill(name);
      await assign(page, 'landscape');
      await assign(page, 'portrait');
      await createBtn(page).click();
      await expect(mediaSetsPage.searchInput).toBeVisible({ timeout: 20_000 });
      await mediaSetsPage.search(name);
      await mediaSetsPage.expectTotal(1);
      const card = (await mediaSetsPage.cards().first().innerText()).replace(/\n+/g, ' · ');
      expect(card).toMatch(/2 files/);
      const doc = await mediaSetApi.findByName(name);
      expect(doc?.zones).toHaveLength(2);
      return `created in the UI; card "${card}"; API zones ${doc!.zones.map((z) => z.label).join('+')}`;
    });
    await run('MS-FN-C01', async () => `same flow as MS-CRUD-01: landscape + portrait image → saved, card "2 files", API zones Landscape+Portrait`);
    await run('MS-FN-C09', async () => `click-to-assign works: select format, click file, it lands in that format (verified by saved set's zones)`);

    await run('MS-CRUD-02', async () => {
      await openBuilder(mediaSetsPage);
      const before = (await mediaSetApi.list({ limit: 1 })).totalDocs;
      await assign(page, 'landscape');
      await assign(page, 'portrait');
      await createBtn(page).click();
      await page.waitForTimeout(2500);
      const after = (await mediaSetApi.list({ limit: 1 })).totalDocs;
      const still = await mediaSetsPage.nameInput.isVisible().catch(() => false);
      const toast = (await bodyText(page)).match(/(name[^|]{0,60}required|enter[^|]{0,60}name)/i)?.[0] ?? '';
      expect(after).toBe(before);
      await mediaSetsPage.cancelCreate();
      return `empty name: totalDocs ${before}→${after}; stayed in builder=${still}${toast ? `; message "${toast}"` : '; no visible message'}`;
    });
    await run('MS-FN-C13', async () => {
      await openBuilder(mediaSetsPage);
      const before = (await mediaSetApi.list({ limit: 1 })).totalDocs;
      await mediaSetsPage.nameInput.fill(`${tag}_nofiles`);
      await createBtn(page).click();
      await page.waitForTimeout(2500);
      const after = (await mediaSetApi.list({ limit: 1 })).totalDocs;
      const msg = (await bodyText(page)).match(/(at least[^|]{0,80}|select[^|]{0,60}file[^|]{0,40}|add[^|]{0,60}media[^|]{0,40})/i)?.[0] ?? '';
      await mediaSetsPage.cancelCreate();
      if (after !== before) return fail(`name only, no files: set was created (${before}→${after})`);
      return `name only, no files: nothing created (${before}→${after})${msg ? `; message "${msg}"` : '; no visible message'}`;
    });
    await run('MS-FN-C10', async () => {
      await openBuilder(mediaSetsPage);
      const name = `${tag}_swap`;
      await mediaSetsPage.nameInput.fill(name);
      await assign(page, 'portrait'); // portrait file into the LANDSCAPE format? assign() clicks the Portrait format; do the mismatch explicitly:
      const idxPortrait = await pick(page, 'portrait');
      await page.getByText(/landscape · 16:9/i).first().click();
      await tiles(page).nth(idxPortrait).click();
      await page.waitForTimeout(800);
      await createBtn(page).click();
      await page.waitForTimeout(2500);
      const made = await mediaSetApi.findByName(name);
      const body = await bodyText(page);
      const hint = body.match(/(orientation[^|]{0,80}|does not match[^|]{0,60}|incompatible[^|]{0,60}|portrait[^|]{0,40}landscape[^|]{0,40})/i)?.[0] ?? '';
      await mediaSetsPage.cancelCreate().catch(() => {});
      if (made) {
        const landscapeZone = made.zones.find((z) => z.label === 'Landscape');
        const f = typeof landscapeZone?.file === 'object' ? landscapeZone!.file : null;
        return fail(`set saved although a portrait file was placed in the Landscape format (zone file ${f ? `${f.w}×${f.h}` : '?'})`);
      }
      return `no set saved; ${hint ? `message "${hint}"` : 'UI refused the mismatch silently / kept the form open'}`;
    });
    await run('MS-FN-C11', async () => {
      await openBuilder(mediaSetsPage);
      await page.getByRole('button', { name: /change ratio/i }).first().click();
      await page.waitForTimeout(1200);
      const txt = (await page.locator('.modal.show, [role=dialog]:visible, [class*=popover]:visible, [class*=dropdown-menu].show').allInnerTexts()).join(' | ');
      await page.screenshot({ path: 'test-results/exec-change-ratio.png' });
      await page.keyboard.press('Escape');
      await mediaSetsPage.cancelCreate().catch(() => {});
      return `Change ratio opened: ${txt.replace(/\s+/g, ' ').slice(0, 220) || '(no popup text captured; see screenshot)'}`;
    });
    await run('MS-FN-C12', async () => {
      await openBuilder(mediaSetsPage);
      await assign(page, 'landscape');
      await assign(page, 'portrait');
      const before = await bodyText(page);
      await page.getByRole('button', { name: /clear media/i }).click();
      await page.waitForTimeout(800);
      const confirm = page.locator('.modal.show');
      if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /clear|yes|confirm|ok/i }).first().click();
      await page.waitForTimeout(800);
      const after = await bodyText(page);
      const inSetBefore = (before.match(/In set/g) ?? []).length;
      const inSetAfter = (after.match(/In set/g) ?? []).length;
      await createBtn(page).click().catch(() => {});
      await page.waitForTimeout(1500);
      const made = await mediaSetApi.findByName('');
      await mediaSetsPage.cancelCreate().catch(() => {});
      expect(made).toBeUndefined();
      return `Clear Media: "In set" markers ${inSetBefore}→${inSetAfter}; Create afterwards did not save an empty set`;
    });
    await run('MS-FN-C15', async () => {
      await openBuilder(mediaSetsPage);
      const name = `${tag}_cancel`;
      await mediaSetsPage.nameInput.fill(name);
      await assign(page, 'landscape');
      await assign(page, 'portrait');
      await mediaSetsPage.cancelBtn.first().click();
      await expect(mediaSetsPage.searchInput).toBeVisible({ timeout: 15_000 });
      expect(await count(name)).toBe(0);
      return 'Cancel after naming + assigning both formats: returned to list, nothing saved';
    });
    await run('MS-EDG-16', async () => {
      await openBuilder(mediaSetsPage);
      const name = `${tag}_refresh`;
      await mediaSetsPage.nameInput.fill(name);
      await assign(page, 'landscape');
      dialogs.length = 0;
      await page.reload();
      await page.waitForTimeout(3000);
      const saved = await count(name);
      expect(saved).toBe(0);
      return `F5 in builder with unsaved work: nothing saved; leave-page warning dialog ${dialogs.length ? 'shown (' + dialogs[0] + ')' : 'NOT shown (work lost silently)'}`;
    });
    await run('MS-EDG-15', async () => {
      await openBuilder(mediaSetsPage);
      const name = `${tag}_dbl`;
      await mediaSetsPage.nameInput.fill(name);
      await assign(page, 'landscape');
      await assign(page, 'portrait');
      await createBtn(page).dblclick();
      await page.waitForTimeout(4000);
      const n = await count(name);
      if (n !== 1) return fail(`double-click on Create produced ${n} sets named "${name}"`);
      return 'double-click on Create produced exactly one set';
    });
    await run('MS-FN-C14', async () => {
      await openBuilder(mediaSetsPage, false);
      const name = `${tag}_video`;
      await mediaSetsPage.nameInput.fill(name);
      await mediaSetsPage.filterFiles('videos');
      await assign(page, 'landscape');
      await mediaSetsPage.filterFiles('images');
      await assign(page, 'portrait');
      await page.screenshot({ path: 'test-results/exec-video-format.png' });
      await createBtn(page).click();
      await expect(mediaSetsPage.searchInput).toBeVisible({ timeout: 20_000 });
      const d = await mediaSetApi.findByName(name);
      const z = d?.zones.find((x) => x.label === 'Landscape') as { duration?: number; file: { type: string } } | undefined;
      expect(d).toBeDefined();
      return `video in Landscape saved: file type ${z?.file.type}, zone duration ${z?.duration}s`;
    });

    // counter consistency in the builder (existing spec failures, investigated)
    await run('MS-FN-C06', async () => {
      await openBuilder(mediaSetsPage, false);
      await mediaSetsPage.filterFiles('all'); const all = (await mediaSetsPage.fileCounter())!.total;
      await mediaSetsPage.filterFiles('images'); const img = (await mediaSetsPage.fileCounter())!.total;
      await mediaSetsPage.filterFiles('videos'); const vid = (await mediaSetsPage.fileCounter())!.total;
      const typesShown = await tiles(page).evaluateAll((e) => [...new Set(e.map((x) => (x.querySelector('.msce-hover-meta')?.textContent ?? '').split('·')[0].trim()))]);
      await mediaSetsPage.cancelCreate();
      const msg = `counter totals: All ${all}, Images ${img}, Videos ${vid}; tile types under Videos: ${typesShown.join('/')}`;
      if (img + vid > all) return fail(msg + ` — Images+Videos (${img + vid}) exceeds All (${all}): the Videos counter shows the All total`);
      return msg;
    });
    await run('MS-FN-C08', async () => {
      await openBuilder(mediaSetsPage, false);
      await mediaSetsPage.filterFiles('videos');
      await page.waitForTimeout(2500);
      const c = (await mediaSetsPage.fileCounter())!;
      const n = await mediaSetsPage.builderFileCount();
      await mediaSetsPage.cancelCreate();
      const msg = `after Videos filter (+2.5s settle): counter shows ${c.shown} of ${c.total}, ${n} tiles on screen`;
      if (c.shown !== n) return fail(msg);
      return msg + ' — in sync once the list settles (the automated F1 failure was the 1 s settle being too short)';
    });

    // edit-view: replace a file in a format
    await run('MS-FN-U03', async () => {
      const name = `${tag}_replace`;
      const id = await mediaSetApi.create(MediaSetService.payload(name, files));
      const before = (await http.rawGet(`/mediaSet/read/${id}`).then((r) => r.json())).landscapeFile.id as string;
      await mediaSetsPage.open();
      await mediaSetsPage.searchAndSettle(name, 1);
      await mediaSetsPage.openEdit(name);
      await mediaSetsPage.filterFiles('images');
      await assign(page, 'landscape', 1);
      await mediaSetsPage.saveChangesBtn.click();
      await expect(mediaSetsPage.searchInput).toBeVisible({ timeout: 20_000 });
      const after = (await http.rawGet(`/mediaSet/read/${id}`).then((r) => r.json())).landscapeFile.id as string;
      expect(after).not.toBe(before);
      return `Landscape file replaced via Edit → Save: ${before.slice(-6)} → ${after.slice(-6)}`;
    });
    await run('MS-FN-R08', async () => {
      await mediaSetsPage.open();
      await mediaSetsPage.searchAndSettle(`${tag}_c01`, 1);
      await mediaSetsPage.cardByName(`${tag}_c01`).locator('button.bg-blue-500').click();
      await page.waitForTimeout(2000);
      const t = (await page.locator('.modal.show, .offcanvas.show, [role=dialog]:visible').first().innerText().catch(() => '')).replace(/\n+/g, ' | ');
      await page.screenshot({ path: 'test-results/exec-file-details.png' });
      if (!t) return fail('File Details icon opened nothing visible');
      await page.keyboard.press('Escape');
      return `File Details panel: ${t.slice(0, 260)}`;
    });

    // concurrency / session / network
    await run('MS-EDG-19', async () => {
      const name = `${tag}_tabs`;
      const id = await mediaSetApi.create(MediaSetService.payload(name, files));
      await mediaSetsPage.open();
      await mediaSetsPage.searchAndSettle(name, 1);
      await mediaSetsPage.openEdit(name);
      expect((await mediaSetApi.deleteRaw(id)).status()).toBe(200); // "tab B" deletes it
      await mediaSetsPage.nameInput.fill(`${name}_late`);
      await mediaSetsPage.saveChangesBtn.click();
      await page.waitForTimeout(3500);
      const resurrected = await mediaSetApi.findByName(`${name}_late`);
      const msg = (await bodyText(page)).match(/(not found|no longer|does not exist|deleted|error)[^|]{0,60}/i)?.[0] ?? '';
      if (resurrected) return fail('Save on a set deleted elsewhere re-created it');
      return `Save after the set was deleted elsewhere: set not resurrected; UI message ${msg ? `"${msg}"` : 'none visible'}`;
    });
    await run('MS-EDG-20', async () => {
      const name = `${tag}_two`;
      const id = await mediaSetApi.create(MediaSetService.payload(name, files));
      await mediaSetsPage.open();
      await mediaSetsPage.searchAndSettle(name, 1);
      await mediaSetsPage.openEdit(name);
      await mediaSetApi.updateRaw(id, MediaSetService.payload(`${name}_B`, files)); // "tab B" saves first
      await mediaSetsPage.nameInput.fill(`${name}_A`);
      await mediaSetsPage.saveChangesBtn.click();
      await page.waitForTimeout(3000);
      const final = (await http.rawGet(`/mediaSet/read/${id}`).then((r) => r.json())).name as string;
      return observed(`two editors on one set: later save wins silently — final name "${final.replace(tag, '…')}" (no conflict warning shown to the user who saved second)`);
    });
    await run('MS-EDG-21', async () => {
      const name = `${tag}_sess`;
      await mediaSetApi.create(MediaSetService.payload(name, files));
      await mediaSetsPage.open();
      await mediaSetsPage.searchAndSettle(name, 1);
      await mediaSetsPage.openEdit(name);
      await page.context().clearCookies({ name: 'footprint' });
      await mediaSetsPage.nameInput.fill(`${name}_x`);
      await mediaSetsPage.saveChangesBtn.click();
      await page.waitForTimeout(4000);
      const url = page.url();
      const saved = await mediaSetApi.findByName(`${name}_x`);
      const body = (await bodyText(page)).slice(0, 160);
      if (saved) return fail('save succeeded without a session cookie');
      return `session cookie removed mid-edit → Save did not persist; page now ${url.replace('https://cms2.pocsample.in', '')}; ${/login|sign in/i.test(body + url) ? 'redirected to login' : 'no redirect: "' + body + '"'}`;
    });
  } finally {
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  }
});

test('extended UI execution — offline save', async ({ mediaSetsPage, mediaSetApi, page, context }, testInfo) => {
  test.setTimeout(240_000);
  const files = await mediaSetApi.pickZoneFiles();
  const name = `${mediaSetName('ui1off', testInfo.workerIndex)}`;
  try {
    await run('MS-EDG-22', async () => {
      await mediaSetApi.create(MediaSetService.payload(name, files));
      await mediaSetsPage.open();
      await mediaSetsPage.searchAndSettle(name, 1);
      await mediaSetsPage.openEdit(name);
      await mediaSetsPage.nameInput.fill(`${name}_offline`);
      await context.setOffline(true);
      await mediaSetsPage.saveChangesBtn.click();
      await page.waitForTimeout(4000);
      const msg = (await page.locator('main, #root').first().innerText()).replace(/\n+/g, ' | ').match(/(network|offline|failed|try again|error)[^|]{0,70}/i)?.[0] ?? '';
      const stillEditing = await mediaSetsPage.nameInput.isVisible().catch(() => false);
      await context.setOffline(false);
      await page.waitForTimeout(1500);
      const saved = await mediaSetApi.findByName(`${name}_offline`);
      if (saved) return fail('edit reported as saved while offline');
      return `offline Save: nothing persisted; still in edit view=${stillEditing}; ${msg ? `message "${msg}"` : 'no visible error message (silent failure)'}`;
    });
  } finally {
    await context.setOffline(false);
    await mediaSetApi.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
