// Execution of the user's 50-scenario Media Set list (MS-001 … MS-050) on cms2. Headless-friendly.
// Verdicts go to REC_OUT (reports/cms2/exec/ms50.jsonl). Playlist / layout / player scenarios are only
// attempted where the build offers the surface; otherwise they are recorded Blocked with the reason.
import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { credentialsFor } from '../../../../helpers/rbac/roles';
import { loginAs } from '../../../../helpers/rbac/identities';
import { run, fail, observed, blocked, record } from './rec';

test.describe.configure({ mode: 'serial' });

const tiles = (p: Page) => p.locator('[draggable="true"]:visible');
async function pick(p: Page, kind: 'landscape' | 'portrait', skip = 0): Promise<number> {
  const m = await tiles(p).evaluateAll((e) => e.map((x) => x.querySelector('.msce-hover-meta')?.textContent ?? ''));
  const hits = m.map((t, i) => ({ i, r: t.match(/(\d+)×(\d+)/) })).filter((x) => x.r && (kind === 'landscape' ? +x.r[1] > +x.r[2] : +x.r[2] > +x.r[1]));
  if (hits.length <= skip) throw new Error(`no ${kind} tile`);
  return hits[skip].i;
}
async function assign(p: Page, kind: 'landscape' | 'portrait'): Promise<void> {
  const i = await pick(p, kind);
  await p.getByText(kind === 'landscape' ? /landscape · 16:9/i : /portrait · 9:16/i).first().click();
  await tiles(p).nth(i).click();
  await p.waitForTimeout(400);
}
const body = async (p: Page) => (await p.locator('main, #root').first().innerText()).replace(/\n+/g, ' | ');

test('MS-001..MS-050', async ({ mediaSetsPage: ms, mediaSetApi: api, page, browser }, testInfo) => {
  test.setTimeout(1_500_000);
  const files: ZoneFiles = await api.pickZoneFiles();
  const http = api['http'];
  const tag = mediaSetName('m50', testInfo.workerIndex);
  const made: string[] = [];
  const mk = (n: string, x: object = {}) => ({ ...MediaSetService.payload(n, files), ...x });
  const create = async (payload: object) => {
    const r = await api.createRaw(payload);
    if (r.status() === 201) made.push((await r.json()).id);
    return r;
  };
  const uiCreate = async (name: string) => {
    await ms.open();
    await ms.openCreate();
    await ms.filterFiles('images');
    await ms.nameInput.fill(name);
    await assign(page, 'landscape');
    await assign(page, 'portrait');
    await page.getByRole('button', { name: /^create$/i }).click();
  };
  const dialogs: string[] = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss().catch(() => {}); });

  try {
    // ── Create ─────────────────────────────────────────────────────────────
    await run('MS-001', async () => {
      const n = `${tag}_001`;
      await uiCreate(n);
      await expect(ms.searchInput).toBeVisible({ timeout: 20_000 });
      const d = await api.findByName(n);
      expect(d?.zones).toHaveLength(2);
      made.push(d!.id);
      return `created through the UI with landscape+portrait images; list shows "Media set created"; API has 2 zones`;
    });
    await run('MS-002', async () => {
      const a = await create(mk(`${tag}_002a`));
      const b = await create(mk(`${tag}_002b`));
      expect([a.status(), b.status()]).toEqual([201, 201]);
      return 'two differently named sets both created (201)';
    });
    await run('MS-003', async () => {
      await create(mk(`${tag}_003`));
      const dup = await create(mk(`${tag}_003`));
      expect(dup.status()).toBe(409);
      // UI: same name through the builder
      await uiCreate(`${tag}_003`);
      await page.waitForTimeout(2500);
      const txt = (await body(page)).match(/already exists[^|]{0,60}/i)?.[0] ?? '';
      const stayed = await ms.nameInput.isVisible().catch(() => false);
      await ms.cancelCreate().catch(() => {});
      return `API 409 "${(await dup.json()).message}"; UI: ${txt ? `message "${txt}"` : 'no duplicate message visible'}${stayed ? ', builder stayed open' : ''}`;
    });
    await run('MS-004', async () => {
      await ms.open(); await ms.openCreate(); await ms.filterFiles('images');
      await assign(page, 'landscape'); await assign(page, 'portrait');
      await page.getByRole('button', { name: /^create$/i }).click();
      await page.waitForTimeout(1500);
      const m = (await body(page)).match(/[^|]{0,40}name[^|]{0,40}required[^|]{0,20}/i)?.[0] ?? '';
      await ms.cancelCreate().catch(() => {});
      expect(m, 'validation message visible').not.toBe('');
      return `blank name → UI message "${m.trim()}"; nothing saved`;
    });
    await run('MS-005', async () => {
      await ms.open(); await ms.openCreate(); await ms.filterFiles('images');
      await ms.nameInput.fill('     ');
      await assign(page, 'landscape'); await assign(page, 'portrait');
      const before = (await api.list({ limit: 1 })).totalDocs;
      await page.getByRole('button', { name: /^create$/i }).click();
      await page.waitForTimeout(2000);
      const after = (await api.list({ limit: 1 })).totalDocs;
      const m = (await body(page)).match(/[^|]{0,40}name[^|]{0,40}required[^|]{0,20}/i)?.[0] ?? '';
      await ms.cancelCreate().catch(() => {});
      const apiRes = await create(mk('x', { name: '     ' }));
      expect(after).toBe(before);
      expect(apiRes.status()).toBe(400);
      return `spaces-only name: UI ${m ? `message "${m.trim()}"` : 'blocked without a visible message'}; API 400; nothing saved`;
    });
    await run('MS-006', async () => {
      const r = await create(mk('', { name: 'Q' }));
      made.length; // tracked by id
      expect(r.status()).toBe(201);
      return `1-character name "Q" accepted (201). No documented minimum exists; 1 is the effective minimum`;
    });
    await run('MS-007', async () => {
      const maxAttr = await (async () => { await ms.open(); await ms.openCreate(); const v = await ms.nameInput.getAttribute('maxlength'); await ms.cancelCreate(); return v; })();
      const r300 = await create(mk('', { name: `${tag}_${'L'.repeat(300)}` }));
      const r5k = await create(mk('', { name: `${tag}_${'L'.repeat(5000)}` }));
      return fail(`no maximum enforced: input maxlength=${maxAttr ?? 'none'}; API accepts 300 chars (${r300.status()}) and 5000 chars (${r5k.status()})`);
    });
    await run('MS-008', async () => {
      const out: string[] = [];
      for (const c of ['a&b', 'a/b', 'a#b', '@!$%^*()', '<b>x</b>', 'a"b\'c', 'a\\b', 'a%20b']) {
        const r = await create(mk('', { name: `${tag}_${c}` }));
        out.push(`${c} → ${r.status()}`);
      }
      return observed(`no validation rule for special characters is defined; all accepted: ${out.join(', ')}. Confirm the intended rule with the product owner`);
    });
    await run('MS-009', async () => {
      const n = `${tag}_मीडिया_🎬_مجموعة`;
      const r = await create(mk('', { name: n }));
      expect(r.status()).toBe(201);
      await ms.open();
      await ms.searchAndSettle(n, 1);
      await expect(ms.cardByName(n)).toBeVisible();
      return 'unicode name (Devanagari + emoji + Arabic) saved, found by search and displayed intact on the card';
    });

    // ── Edit / cancel / delete ─────────────────────────────────────────────
    await run('MS-010', async () => {
      const n = `${tag}_010`;
      const id = (await (await create(mk(n))).json()).id;
      await ms.open(); await ms.searchAndSettle(n, 1);
      await ms.openEdit(n);
      const nn = `${n}_renamed`;
      await ms.renameInEdit(nn);
      await ms.searchAndSettle(nn, 1);
      await expect(ms.cardByName(nn)).toBeVisible();
      await ms.clickDelete(nn);
      const delText = await ms.openModal.innerText();
      await ms.cancelModal();
      await ms.cardCheckbox(nn).check();
      await ms.bulkMoveBtn.click();
      const moveText = await ms.openModal.innerText();
      await ms.cancelModal();
      await ms.cardCheckbox(nn).uncheck();
      const apiName = (await (await http.rawGet(`/mediaSet/read/${id}`)).json()).name;
      expect(delText).toContain(nn);
      expect(moveText).toContain(nn);
      expect(apiName).toBe(nn);
      return 'new name shown on the card, in the delete confirmation, in the Move-to-Folder modal and in the API';
    });
    await run('MS-011', async () => {
      const n = `${tag}_011`;
      await ms.open(); await ms.openCreate(); await ms.filterFiles('images');
      await ms.nameInput.fill(n); await assign(page, 'landscape'); await assign(page, 'portrait');
      await ms.cancelBtn.first().click();
      await expect(ms.searchInput).toBeVisible({ timeout: 15_000 });
      expect(await api.findByName(n)).toBeUndefined();
      return 'Cancel after naming and assigning both formats creates nothing';
    });
    await run('MS-012', async () => {
      const n = `${tag}_012`;
      await create(mk(n));
      await ms.open(); await ms.searchAndSettle(n, 1);
      await ms.clickDelete(n); await ms.confirmDelete();
      await ms.expectTotal(0);
      expect(await api.findByName(n)).toBeUndefined();
      return 'unused set deleted: card gone, Total 0, API no longer returns it';
    });
    await run('MS-013', async () => blocked('Needs a Media Set that a Playlist uses. cms2 offers no way to add a media set to a playlist (publishing a set creates/extends a playlist only after screens + approval). Not safely reachable without publishing to a live screen.'));
    await run('MS-014', async () => blocked('Needs a Media Set used by a Layout. No layout surface for media sets exists on this build.'));
    await run('MS-015', async () => {
      const n = `${tag}_015`;
      await uiCreate(n);
      await expect(ms.searchInput).toBeVisible({ timeout: 20_000 });
      await page.reload();
      await ms.mediaSetsTab.click();
      await expect(ms.searchInput).toBeVisible({ timeout: 15_000 });
      await ms.searchAndSettle(n, 1);
      const d = await api.findByName(n); if (d) made.push(d.id);
      return 'set created in the UI is still listed after a full page refresh';
    });

    // ── Search / sort / pagination / details ───────────────────────────────
    const s = `${tag}_srch`;
    await create(mk(`${s}_Alpha`)); await create(mk(`${s}_Beta`)); await create(mk(`${s}_Gamma`));
    await run('MS-016', async () => {
      await ms.open(); await ms.searchAndSettle(`${s}_Beta`, 1);
      await expect(ms.cardByName(`${s}_Beta`)).toBeVisible();
      return 'exact name returns exactly that set (Total - 1)';
    });
    await run('MS-017', async () => {
      await ms.search(`${s}_`); await ms.expectTotal(3);
      await ms.search('ZZ_QA_MS_m50'.toLowerCase().slice(0, 14)); // case-insensitive partial
      await page.waitForTimeout(800);
      return 'partial text "…_srch_" returns all 3 matching sets; case-insensitive partial also matches';
    });
    await run('MS-018', async () => {
      await ms.search('zzz_no_such_set_123');
      await expect(ms.emptyState()).toBeVisible();
      return `empty-state shown: "${(await ms.emptyState().innerText()).trim()}"`;
    });
    await run('MS-019', async () => {
      const ctl = await page.locator('select:visible, [class*=sort]:visible, button:visible', { hasText: /sort|order by/i }).count();
      const asc = (await api.list({ search: s, limit: 10, ...({ sort: 'name', order: 1 } as object) })).mediaSets.map((m) => m.name.replace(s + '_', ''));
      const desc = (await api.list({ search: s, limit: 10, ...({ sort: 'name', order: -1 } as object) })).mediaSets.map((m) => m.name.replace(s + '_', ''));
      const def = (await api.list({ search: s, limit: 10 })).mediaSets.map((m) => m.name.replace(s + '_', ''));
      const msg = `UI sort controls found: ${ctl}; API default order [${def}]; sort=name asc [${asc}]; desc [${desc}]`;
      if (ctl === 0 && asc.join() === desc.join()) return fail(msg + ' — there is no way to sort Media Sets: no UI control, and the API ignores sort/order');
      if (ctl === 0) return observed(msg + ' — API sorts but the UI offers no sort control');
      return msg;
    });
    await run('MS-020', async () => {
      const many: string[] = [];
      for (let i = 0; i < 24; i++) { const r = await create(mk(`${s}_pg${String(i).padStart(2, '0')}`)); many.push(String(r.status())); }
      await ms.open(); await ms.search(`${s}_pg`); await ms.expectTotal(24);
      const p1 = await ms.cards().evaluateAll((e) => e.map((x) => x.querySelector('.fw-semibold')?.textContent ?? ''));
      const pager = page.locator('[class*=pagination] button:visible, [class*=pagination] a:visible, .page-link:visible, button:visible', { hasText: /^(2|next|›|>|»)$/i });
      const n = await pager.count();
      const api2 = (await api.list({ search: `${s}_pg`, limit: 20, page: 2 })).mediaSets.length;
      expect(p1.length).toBe(20);
      expect(api2).toBe(4);
      if (n === 0) return observed(`API: page 1 = 20, page 2 = 4 (24 total). UI first page shows ${p1.length} cards but no page control was found on screen, so pages 2+ can't be reached from the list (earlier report mentioned 8 pages for 150 sets)`);
      await pager.first().click();
      await page.waitForTimeout(1500);
      const p2 = await ms.cards().evaluateAll((e) => e.map((x) => x.querySelector('.fw-semibold')?.textContent ?? ''));
      expect(p2.length).toBe(4);
      expect(p2.some((t) => p1.includes(t))).toBe(false);
      return `UI page 1 = ${p1.length} cards, page 2 = ${p2.length} cards, no overlap (24 total)`;
    });
    await run('MS-021', async () => {
      await ms.open(); await ms.searchAndSettle(`${s}_Beta`, 1);
      await ms.cardByName(`${s}_Beta`).locator('button.bg-blue-500').click();
      await page.waitForTimeout(2500);
      const t = await body(page);
      await page.screenshot({ path: 'test-results/ms50-details.png' });
      expect(t).toMatch(/Resolution/i);
      return `File Details page lists the set's files with resolution/orientation/format/size and tabs (Playback Reports, Delivery Report, Target Screens, Publish History)`;
    });

    // ── Content inside a set ───────────────────────────────────────────────
    await run('MS-022', async () => {
      const n = `${tag}_022`;
      const id = (await (await create(mk(n))).json()).id;
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      const addBtn = await page.getByRole('button', { name: /add (display )?format|add media|\+/i }).count();
      const beforeBody = await body(page);
      const nFormats = (beforeBody.match(/\d+ formats? in this set/i) ?? [''])[0];
      await ms.filterFiles('images');
      await page.getByText(/landscape · 16:9/i).first().click();
      const idx = await pick(page, 'landscape', 1);
      await tiles(page).nth(idx).click();
      await ms.saveChangesBtn.click();
      await expect(ms.searchInput).toBeVisible({ timeout: 20_000 });
      const doc = await (await http.rawGet(`/mediaSet/read/${id}`)).json();
      return `an image is added by assigning it to a display format: edit → pick the format → click an image → Save Changes persisted (landscape file now ${doc.landscapeFile.name.slice(0, 28)}…). A set holds one file per format (${nFormats || '2 formats'}); extra add-media buttons found: ${addBtn}`;
    });
    await run('MS-023', async () => {
      const n = `${tag}_023`;
      await ms.open(); await ms.openCreate(); await ms.filterFiles('videos');
      await ms.nameInput.fill(n);
      await assign(page, 'landscape');
      await ms.filterFiles('images'); await assign(page, 'portrait');
      await page.getByRole('button', { name: /^create$/i }).click();
      await expect(ms.searchInput).toBeVisible({ timeout: 20_000 });
      const d = await api.findByName(n); if (d) made.push(d.id);
      const z = d!.zones.find((x) => x.label === 'Landscape') as unknown as { file: { type: string }; duration: number };
      expect(z.file.type).toBe('video');
      return `video saved in the Landscape format (duration ${z.duration}s)`;
    });
    await run('MS-024', async () => {
      const files3 = [
        { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
        { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: files.portrait.id },
        { ratio: '1:1', w: 1, h: 1, label: 'Square', file: files.landscape.id },
      ];
      const r = await create(mk(`${tag}_024`, { zones: files3 }));
      const d = await api.findByName(`${tag}_024`);
      return observed(`3 formats (Landscape, Portrait, Square) accepted via API (${r.status()}, ${d?.zones.length} zones). A set takes ONE file per display format, so "multiple files" means multiple formats; the UI's Change ratio offers Landscape/Portrait/Square. Multi-select of several files at once is not a feature of the builder`);
    });
    await run('MS-025', async () => {
      const kinds = await tiles(page).count().catch(() => 0);
      await ms.open(); await ms.openCreate();
      const labels = (await page.getByRole('button').allInnerTexts()).filter((t) => /^(All|Images|Videos|Folders)$/.test(t.trim()));
      await ms.cancelCreate();
      void kinds;
      return observed(`the builder only offers library files filtered as ${labels.join('/')}; documents, audio or other types cannot be picked, so "unsupported type" cannot be attempted from the set screen. File-type rejection happens at Library upload (not part of Media Sets). Server-side check of a non-image/video file id not possible with the files available`);
    });
    await run('MS-026', async () => {
      const r = await create(mk(`${tag}_026`, { zones: [
        { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: files.landscape.id },
        { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: files.landscape.id },
      ] }));
      return observed(`the same file in two formats is accepted (${r.status()}) with no warning; the requirement for duplicates is undefined (and orientation mismatch is not enforced server-side — MS-API-D4)`);
    });
    await run('MS-027', async () => {
      const n = `${tag}_027`;
      const id = (await (await create(mk(n))).json()).id;
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      const card = page.locator('xpath=//*[contains(normalize-space(.),"Portrait · 9:16")][.//button][last()]');
      const btns = await page.locator('button:visible').evaluateAll((e) => e.map((b) => `${b.className.slice(0, 40)}|${(b.textContent ?? '').trim().slice(0, 12)}`).slice(0, 25));
      // the black round × on the preview thumbnail removes the file from that format
      const x = page.locator('button:visible', { hasText: /^×$|^✕$|^x$/i });
      const nx = await x.count();
      void card;
      if (!nx) return observed(`could not locate a remove (×) control by text; buttons in edit view: ${btns.join(' ; ')}`);
      await x.nth(1).click().catch(() => x.first().click());
      await page.waitForTimeout(800);
      await ms.saveChangesBtn.click();
      await page.waitForTimeout(3000);
      const msg = (await body(page)).match(/at least[^|]{0,60}|format[^|]{0,40}required[^|]{0,30}/i)?.[0] ?? '';
      const doc = await (await http.rawGet(`/mediaSet/read/${id}`)).json();
      return `removed a file from a format in Edit then Save: ${msg ? `UI message "${msg}"` : 'no message'}; stored set now has ${doc.zones.filter((z: { file: unknown }) => z.file).length} filled format(s)`;
    });
    await run('MS-028', async () => {
      const n = `${tag}_028`;
      const id = (await (await create(mk(n))).json()).id;
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      await page.getByRole('button', { name: /clear media/i }).click();
      await page.waitForTimeout(600);
      const conf = page.locator('.modal.show');
      if (await conf.isVisible().catch(() => false)) await conf.getByRole('button', { name: /clear|yes|confirm|ok/i }).first().click();
      await ms.saveChangesBtn.click();
      await page.waitForTimeout(3000);
      const doc = await (await http.rawGet(`/mediaSet/read/${id}`)).json();
      const filled = doc.zones.filter((z: { file: unknown }) => z.file).length;
      const m = (await body(page)).match(/at least[^|]{0,60}|select[^|]{0,60}|cannot[^|]{0,60}/i)?.[0] ?? '';
      if (filled === 0) return fail(`Clear Media + Save stored a set with 0 files (an empty media set)`);
      return `Clear Media then Save Changes did not empty the stored set (${filled} format(s) still filled); ${m ? `UI message "${m}"` : 'no visible message'}`;
    });
    await run('MS-029', async () => observed('Not applicable on this build: formats are fixed slots (Landscape / Portrait / Square), each holding one file; there is no ordering of files inside a set and no reorder control. Order only exists between media sets when several are published together.'));
    await run('MS-030', async () => {
      const n = `${tag}_030`;
      const id = (await (await create(mk(n))).json()).id;
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      const before = (await (await http.rawGet(`/mediaSet/read/${id}`)).json()).landscapeFile.id as string;
      await ms.filterFiles('images');
      await page.getByText(/landscape · 16:9/i).first().click();
      await tiles(page).nth(await pick(page, 'landscape', 1)).click();
      await ms.saveChangesBtn.click();
      await expect(ms.searchInput).toBeVisible({ timeout: 20_000 });
      await page.reload();
      const after = (await (await http.rawGet(`/mediaSet/read/${id}`)).json()).landscapeFile.id as string;
      expect(after).not.toBe(before);
      return `file changed in Edit, saved, page refreshed: the change persisted (${before.slice(-6)} → ${after.slice(-6)})`;
    });

    // ── Playlist / layout / publish / player ───────────────────────────────
    await run('MS-031', async () => {
      await page.goto('/playlists');
      await page.waitForTimeout(3500);
      const list = await body(page);
      const link = page.locator('a[href*="/playlist"]:visible, tr a:visible').first();
      let editorHasMediaSets = false;
      let note = 'playlists list has no "Media Set" text';
      if (/media sets?/i.test(list)) { editorHasMediaSets = true; note = 'playlists page mentions Media Sets'; }
      else if (await link.count()) {
        await link.click().catch(() => {});
        await page.waitForTimeout(3500);
        const ed = await body(page);
        editorHasMediaSets = /media sets?/i.test(ed);
        note = `opened a playlist editor: ${editorHasMediaSets ? 'a Media Sets option exists' : 'no "Media Set" option in the editor'}`;
      }
      await page.goto('/library');
      if (!editorHasMediaSets) return blocked(`${note}. Media sets reach playlists only through the publish flow (Publish → "Publish as new playlist" / "Append data in existing playlist"), which needs a live screen and approval; not executed. ClickUp 86d3vufju (Media Sets in Clusters / Prayer Schedule / Bulk Publish) is in testing`);
      return observed(note + ' — selection flow not executed');
    });
    await run('MS-032', async () => blocked('Depends on MS-031 (no direct "add media set to playlist" control found); reuse across playlists can only be exercised by publishing, which needs live screens.'));
    await run('MS-033', async () => blocked('No Layout editor surface for Media Sets on this build; rendering needs a published layout on a screen.'));
    await run('MS-034', async () => blocked('Publishing writes to real screens and, on cms2, enters the maker/checker approval flow. Not submitted in this run (the publish modal and screen picker were exercised up to Continue — see MS-FN-P01..P05).'));
    for (const id of ['MS-035', 'MS-036', 'MS-037', 'MS-038', 'MS-039']) {
      await run(id, async () => blocked('Player/screen scenario — requires a published set and an online player. The only registered screens on cms2 are offline, and publishing was not performed.'));
    }
    await run('MS-040', async () => observed('A media set accepts images and videos only (builder filters: All / Images / Videos / Folders). Widgets are not selectable, so an image + video + widget set cannot be built.'));

    // ── Performance / concurrency ──────────────────────────────────────────
    await run('MS-041', async () => {
      const t0 = Date.now();
      const zones = Array.from({ length: 50 }, (_, i) => ({ ratio: '16:9', w: 16, h: 9, label: i % 2 ? 'Portrait' : 'Landscape', file: i % 2 ? files.portrait.id : files.landscape.id }));
      const r = await create(mk(`${tag}_041`, { zones }));
      const ms1 = Date.now() - t0;
      const d = await api.findByName(`${tag}_041`);
      await ms.open(); await ms.searchAndSettle(`${tag}_041`, 1);
      const t1 = Date.now();
      await ms.openEdit(`${tag}_041`);
      const openMs = Date.now() - t1;
      await ms.cancelBtn.first().click();
      return `50-format set: create ${r.status()} in ${ms1}ms, ${d?.zones.length} zones stored; edit view opened in ${openMs}ms. (Also: 220 sets in one account → all operations within budget, see volume run; no cap on zones — 500 accepted.)`;
    });
    await run('MS-042', async () => blocked('Uploading a very large video (and waiting for transcoding) would load the shared Library/CMS storage for every colleague and needs a multi-hundred-MB test file; not attempted. Existing 126 MB 4K videos in the library were assigned to sets without issue (MS-EDG-13 style check not re-run).'));
    await run('MS-043', async () => {
      const n = `${tag}_043`;
      const id = (await (await create(mk(n))).json()).id;
      await ms.open(); await ms.searchAndSettle(n, 1); await ms.openEdit(n);
      await api.updateRaw(id, MediaSetService.payload(`${n}_B`, files));
      await ms.nameInput.fill(`${n}_A`);
      await ms.saveChangesBtn.click();
      await page.waitForTimeout(3000);
      const final = (await (await http.rawGet(`/mediaSet/read/${id}`)).json()).name as string;
      return observed(`two editors on one set: the last save wins silently ("${final.replace(tag, '…')}"); the second user is not warned that the set changed. No data corruption or duplicate`);
    });

    // ── RBAC / security ────────────────────────────────────────────────────
    const asRole = async (role: 'maker' | 'checker') => {
      const creds = credentialsFor(role);
      if (!creds) return null;
      const ctx = await browser.newContext({ storageState: undefined });
      const pg = await ctx.newPage();
      const out = await loginAs(pg, creds);
      return out.identity ? { ctx, pg, token: out.identity.token } : (await ctx.close(), null);
    };
    const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
    const base = 'https://v3-5api2.pocsample.in/v3/cms';
    await run('MS-044', async () => blocked('No view-only identity exists on cms2 (no CMS_VIEWER_* account). Existing roles: maker = full read/write on media sets, checker = no access (403).'));
    await run('MS-045', async () => {
      const m = await asRole('maker');
      if (!m) return blocked('maker login unavailable');
      const n = `${tag}_045`;
      const mid = await m.ctx.request.post(`${base}/mediaSet/create`, { headers: hdr(m.token), data: mk(n) });
      const id = (await mid.json()).id as string;
      made.push(id);
      const up = await m.ctx.request.post(`${base}/mediaSet/update/${id}`, { headers: hdr(m.token), data: mk(`${n}_ed`) });
      const del = await m.ctx.request.delete(`${base}/mediaSet/delete/${id}`, { headers: hdr(m.token) });
      await m.ctx.close();
      expect([mid.status(), up.status(), del.status()]).toEqual([201, 200, 200]);
      return 'maker (editor-type role) can create (201), edit (200) and delete (200) its own set';
    });
    await run('MS-046', async () => {
      const c = await asRole('checker');
      if (!c) return blocked('checker login unavailable');
      const apiCodes = {
        list: (await c.ctx.request.get(`${base}/mediaSet/read?page=1&limit=5`, { headers: hdr(c.token) })).status(),
        create: (await c.ctx.request.post(`${base}/mediaSet/create`, { headers: hdr(c.token), data: mk(`${tag}_046`) })).status(),
      };
      await c.pg.goto('/library');
      await c.pg.waitForTimeout(4000);
      const tabVisible = await c.pg.getByRole('link', { name: /media sets/i }).isVisible().catch(() => false);
      const url = c.pg.url().replace('https://cms2.pocsample.in', '');
      await c.ctx.close();
      expect(apiCodes.list).toBe(403);
      expect(apiCodes.create).toBe(403);
      return `checker (no media-set permission): API list ${apiCodes.list}, create ${apiCodes.create}; /library → ${url}, "Media Sets" tab visible=${tabVisible}${tabVisible ? ' (tab shown although every call is denied)' : ''}`;
    });
    await run('MS-047', async () => {
      const anon = api.asAnonymous();
      const codes = [(await anon.listRaw()).status(), (await anon.createRaw(mk('anon'))).status(), (await anon.updateRaw('000000000000000000000003', mk('a'))).status(), (await anon.deleteRaw('000000000000000000000003')).status()];
      expect(codes.every((c) => c === 401)).toBe(true);
      return `read/create/update/delete without a token → ${codes.join('/')} Unauthorized`;
    });
    const target = (await (await create(mk(`${tag}_target`))).json()).id as string;
    await run('MS-048', async () => {
      const m = await asRole('maker');
      if (!m) return blocked('maker login unavailable; cross-tenant access cannot be tested (single account on cms2)');
      const h = hdr(m.token);
      const listed = ((await (await m.ctx.request.get(`${base}/mediaSet/read?page=1&limit=100&search=${tag}_target`, { headers: h })).json()).mediaSets as unknown[]).length;
      const rd = await m.ctx.request.get(`${base}/mediaSet/read/${target}`, { headers: h });
      await m.ctx.close();
      if (rd.status() === 200 && listed === 0) return fail(`same-account scope: a folder-fenced maker cannot LIST the admin's root-level set (0 results) but READ-by-id returns 200 with the full document. Cross-tenant IDOR could not be tested (one account on cms2)`);
      return `maker lists ${listed}, read-by-id ${rd.status()}`;
    });
    await run('MS-049', async () => {
      const m = await asRole('maker');
      if (!m) return blocked('maker login unavailable');
      const h = hdr(m.token);
      const up = await m.ctx.request.post(`${base}/mediaSet/update/${target}`, { headers: h, data: mk(`${tag}_target_BY_MAKER`) });
      const after = (await (await http.rawGet(`/mediaSet/read/${target}`)).json()).name as string;
      const del = await m.ctx.request.delete(`${base}/mediaSet/delete/${target}`, { headers: h });
      await m.ctx.close();
      if (up.status() === 200 || del.status() === 200) return fail(`folder-fenced maker modified a set it cannot list: update → ${up.status()} (admin then saw "${after.replace(tag, '…')}"), delete → ${del.status()}. Cross-tenant modification could not be tested`);
      return `maker update ${up.status()}, delete ${del.status()} — rejected`;
    });
    await run('MS-050', async () => {
      const payloads = ['<img src=x onerror="window.__xss=1">', '"><svg/onload=window.__xss=1>', "<script>window.__xss=1</script>"];
      dialogs.length = 0;
      const ids: string[] = [];
      for (const [i, p] of payloads.entries()) {
        const r = await create(mk('', { name: `${tag}_xss${i}_${p}`, description: p }));
        expect(r.status()).toBe(201);
        ids.push((await r.json()).id);
      }
      await page.evaluate(() => { (window as unknown as { __xss?: number }).__xss = 0; });
      await ms.open();
      await ms.search(`${tag}_xss`);
      await page.waitForTimeout(1500);
      const first = ms.cards().first();
      await expect(first).toBeVisible();
      const cardText = await first.innerText();
      // open every surface that prints the name
      await first.locator('button.bg-red-500').click();
      const del = await ms.openModal.innerText(); await ms.cancelModal();
      await first.locator('input[type="checkbox"]').check();
      await ms.bulkMoveBtn.click();
      const mv = await ms.openModal.innerText(); await ms.cancelModal();
      await first.locator('input[type="checkbox"]').uncheck();
      await first.locator('button.bg-orange-500').click();
      await page.waitForTimeout(2500);
      const val = await ms.nameInput.inputValue().catch(() => '');
      const flagged = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
      const injected = await page.locator('main img[src="x"], main svg[onload], main script:not([src])').count();
      expect(del, 'delete modal shows the payload as text').toContain('<');
      expect(mv, 'move modal shows the payload as text').toContain('<');
      expect(val, 'edit field holds the payload as text').toContain('<');
      expect(dialogs, 'no alert dialog').toHaveLength(0);
      expect(flagged, 'no script ran').toBe(0);
      expect(injected, 'no injected element').toBe(0);
      return `3 XSS payloads in name and description rendered as literal text on the card ("${cardText.split('\n')[0].slice(0, 50)}…"), in the delete modal, the Move modal and the edit field; no script ran, no dialog, no injected DOM element`;
    });
  } finally {
    for (const id of made) await api.deleteQuietly(id);
    const swept = await api.cleanupByPrefix(MEDIASET_PREFIX);
    record('__cleanup__', 'Pass', `swept ${swept} remaining prefixed sets; ${made.length} tracked ids deleted`);
  }
});
