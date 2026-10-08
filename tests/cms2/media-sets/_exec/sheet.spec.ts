// Execution of the "MEDIA SET TEST CASE" Google Sheet (MS-CRUD/FILE/RATIO/CLEAR/E2E/BVA/NEG). Verdicts via rec.ts.
import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { run, fail, observed, blocked } from './rec';

test.describe.configure({ mode: 'serial' });

const tiles = (page: Page) => page.locator('[draggable="true"]:visible');
const metas = (page: Page) => tiles(page).evaluateAll((e) => e.map((x) => x.querySelector('.msce-hover-meta')?.textContent ?? ''));
async function pick(page: Page, kind: 'landscape' | 'portrait', skip = 0): Promise<number> {
  const m = await metas(page);
  const hits = m.map((t, i) => ({ i, r: t.match(/(\d+)×(\d+)/) })).filter((x) => x.r && (kind === 'landscape' ? +x.r[1] > +x.r[2] : +x.r[2] > +x.r[1]));
  if (hits.length <= skip) throw new Error(`no ${kind} tile #${skip} among ${m.length}`);
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
const descInput = (page: Page) => page.getByPlaceholder(/description/i).first();
const inSet = async (page: Page) => ((await bodyText(page)).match(/In set/g) ?? []).length;
const A = (n: number) => 'A'.repeat(n);

test('sheet execution', async ({ mediaSetsPage: m, mediaSetApi: api, page }, testInfo) => {
  test.setTimeout(1_500_000);
  const files: ZoneFiles = await api.pickZoneFiles();
  const http = api['http'];
  const tag = mediaSetName('sh', testInfo.workerIndex);
  const read = async (id: string) => (await http.rawGet(`/mediaSet/read/${id}`)).json();
  const count = async (name: string) => (await api.list({ search: name, limit: 100 })).mediaSets.filter((x) => x.name === name).length;
  const total = async () => (await api.list({ limit: 1 })).totalDocs;
  const open = async (images = true) => { await m.open(); await m.openCreate(); if (images) await m.filterFiles('images'); };
  const fillBoth = async () => { await assign(page, 'landscape'); await assign(page, 'portrait'); };
  const uiCreate = async (name: string, desc?: string) => {
    await open();
    await m.nameInput.fill(name);
    if (desc !== undefined) await descInput(page).fill(desc);
    await fillBoth();
    const before = await total();
    await createBtn(page).click();
    await page.waitForTimeout(3500);
    const msg = (await bodyText(page)).match(/(required|invalid|limit|maximum|max |characters|exists|already|duplicate|not allowed)[^|]{0,70}/i)?.[0] ?? '';
    const doc = name.trim() === '' ? undefined : await api.findByName(name);
    const stillOpen = await m.nameInput.isVisible().catch(() => false);
    if (stillOpen) await m.cancelCreate().catch(() => {});
    return { doc, msg, before, after: await total(), stillOpen };
  };
  const seed = async (suffix: string) => {
    const name = `${tag}_${suffix}`;
    const id = await api.create(MediaSetService.payload(name, files));
    return { name, id };
  };
  const edit = async (name: string) => { await m.open(); await m.searchAndSettle(name, 1); await m.openEdit(name); };
  const settle = () => page.waitForTimeout(2500);
  const names = async () => tiles(page).evaluateAll((e) => e.map((x) => (x.textContent ?? '').split('\n')[0].trim()));
  const kinds = async () => tiles(page).evaluateAll((e) => [...new Set(e.map((x) => (x.querySelector('.msce-hover-meta')?.textContent ?? '').split('·')[0].trim()))]);
  const changeRatio = async (to: string) => {
    await page.getByRole('button', { name: /change ratio/i }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: new RegExp(`^${to}$`, 'i') }).first().click();
    await page.waitForTimeout(900);
  };
  const clear = async () => {
    await page.getByRole('button', { name: /clear media/i }).click();
    await page.waitForTimeout(800);
    const dlg = page.locator('.modal.show');
    return (await dlg.isVisible().catch(() => false)) ? dlg : null;
  };

  try {
    // ───────── CRUD ─────────
    await run('MS-CRUD-01', async () => {
      const name = `${tag}_c01`;
      const r = await uiCreate(name, 'valid description');
      expect(r.doc).toBeDefined();
      await m.open(); await m.search(name); await m.expectTotal(1);
      return `created via UI with description; list shows it; API description "${(r.doc as any).description}"`;
    });
    await run('MS-CRUD-02', async () => {
      const r = await uiCreate('', 'desc only');
      expect(r.after).toBe(r.before);
      return `blank name: nothing created (${r.before}→${r.after}); message "${r.msg || 'none matched'}"`;
    });
    const lenCase = (id: string, field: 'name' | 'desc', n: number, mustAccept: boolean) => run(id, async () => {
      const prefix = `${tag}_`;
      const name = field === 'name' ? prefix.padEnd(n, 'N').slice(0, Math.max(n, 0)) : `${tag}_len${n}`;
      const r = await uiCreate(name, field === 'desc' ? A(n) : undefined);
      const stored = field === 'name' ? (r.doc as any)?.name : (r.doc as any)?.description;
      const len = stored ? String(stored).length : 0;
      const msg = `${field} ${n} chars via UI: ${r.doc ? `saved (stored length ${len})` : `NOT saved; message "${r.msg || 'none'}"`}`;
      if (mustAccept && !r.doc) return fail(msg);
      if (!mustAccept && r.doc && len > 50) return fail(msg + ' — over-limit value accepted; no max length enforced');
      return msg;
    });
    await lenCase('MS-BVA-01', 'name', 49, true);
    await lenCase('MS-CRUD-03', 'name', 50, true);
    await lenCase('MS-BVA-02', 'name', 50, true);
    await lenCase('MS-CRUD-04', 'name', 51, false);
    await lenCase('MS-BVA-03', 'name', 51, false);
    await lenCase('MS-BVA-04', 'desc', 49, true);
    await lenCase('MS-CRUD-05', 'desc', 50, true);
    await lenCase('MS-BVA-05', 'desc', 50, true);
    await lenCase('MS-CRUD-06', 'desc', 51, false);
    await lenCase('MS-BVA-06', 'desc', 51, false);

    await run('MS-CRUD-07', async () => {
      const s = await seed('c07');
      await edit(s.name);
      await m.nameInput.fill(`${s.name}_ed`);
      await descInput(page).fill('edited description');
      await m.saveChangesBtn.click();
      await expect(m.searchInput).toBeVisible({ timeout: 20_000 });
      const d = await read(s.id);
      expect(d.name).toBe(`${s.name}_ed`);
      expect(d.description).toBe('edited description');
      await m.search(`${s.name}_ed`); await m.expectTotal(1);
      return 'name + description updated; API and list show new values';
    });
    await run('MS-CRUD-08', async () => {
      const s = await seed('c08');
      await edit(s.name);
      await m.nameInput.fill(`${s.name}_zzz`);
      await descInput(page).fill('should not save');
      await m.cancelBtn.click();
      await page.waitForTimeout(2000);
      const d = await read(s.id);
      expect(d.name).toBe(s.name);
      expect(d.description ?? '').not.toBe('should not save');
      return `Cancel in edit: original values kept (unsaved-changes prompt ${/discard|unsaved/i.test(await bodyText(page)) ? 'shown' : 'not shown'})`;
    });
    await run('MS-CRUD-09', async () => {
      const s = await seed('c09');
      await m.open(); await m.searchAndSettle(s.name, 1);
      await m.clickDelete(s.name); await m.confirmDelete();
      await page.waitForTimeout(1500);
      expect(await count(s.name)).toBe(0);
      return 'confirm delete: set removed';
    });
    await run('MS-CRUD-10', async () => {
      const s = await seed('c10');
      await m.open(); await m.searchAndSettle(s.name, 1);
      await m.clickDelete(s.name); await m.cancelModal();
      await page.waitForTimeout(800);
      expect(await count(s.name)).toBe(1);
      return 'cancel on delete confirmation: set still exists';
    });
    await run('MS-CRUD-11', async () => {
      const name = `${tag}_c11`;
      await uiCreate(name, 'persist me');
      await page.reload();
      await m.open(); await m.search(name); await m.expectTotal(1);
      const d = await api.findByName(name);
      return `after reload set persists; description "${(d as any)?.description}"`;
    });

    // ───────── FILE search / filter (builder file browser) ─────────
    await open(false);
    await settle();
    const fname = ((await names())[0] ?? '').trim();
    await run('MS-FILE-01', async () => {
      await m.filterFiles('all'); await m.searchFiles(fname); await settle();
      const n = await names();
      expect(n.some((x) => x.includes(fname.slice(0, 20)))).toBe(true);
      return `exact name "${fname.slice(0, 40)}" → ${n.length} tile(s)`;
    });
    await run('MS-FILE-02', async () => {
      await m.searchFiles('sample_1280'); await settle();
      const n = await names();
      expect(n.length).toBeGreaterThan(0);
      if (!n.every((x) => /sample_1280/i.test(x))) return fail(`partial "sample_1280" returned non-matching: ${n.slice(0, 4).join(', ')}`);
      return `partial "sample_1280" → ${n.length} tiles, all match`;
    });
    await run('MS-FILE-03', async () => {
      await m.searchFiles('zzz_nofile_987'); await settle();
      const n = (await names()).length; const t = await bodyText(page);
      expect(n).toBe(0);
      const es = t.match(/no (files|results|media)[^|]{0,40}|not found[^|]{0,30}|nothing[^|]{0,30}/i)?.[0];
      return `0 tiles; empty-state ${es ? `"${es}"` : 'NOT shown (blank grid)'}`;
    });
    await run('MS-FILE-04', async () => {
      await m.searchFiles('zzz_nofile_987'); await settle(); await m.searchFiles(''); await settle();
      const n = (await names()).length;
      expect(n).toBeGreaterThan(10);
      return `search cleared → ${n} tiles back`;
    });
    await run('MS-FILE-05', async () => { await m.filterFiles('all'); await settle(); return `All shows types: ${(await kinds()).join('/')} (${(await names()).length} tiles)`; });
    await run('MS-FILE-06', async () => { await m.filterFiles('images'); await settle(); const k = await kinds(); if (k.some((x) => !/image/i.test(x))) return fail(`Images shows ${k.join('/')}`); return `Images → only ${k.join('/')}`; });
    await run('MS-FILE-07', async () => { await m.filterFiles('videos'); await settle(); const k = await kinds(); if (k.some((x) => !/video/i.test(x))) return fail(`Videos shows ${k.join('/')}`); return `Videos → only ${k.join('/')}`; });
    await run('MS-FILE-08', async () => {
      await m.filterFiles('all');
      await page.getByRole('button', { name: /^folders$/i }).click(); await settle();
      return observed(`Folders filter clicked; view: ${(await bodyText(page)).slice(300, 600)}`);
    });
    await run('MS-FILE-09', async () => blocked('no "All Files" option exists — filter offers All / Images / Videos / Folders; "All" covered by MS-FILE-05'));
    await run('MS-FILE-10', async () => {
      await m.filterFiles('images'); await m.searchFiles('sample_1920'); await settle();
      const n = await names(); const k = await kinds();
      if (k.some((x) => !/image/i.test(x))) return fail(`Images + "sample_1920" shows ${k.join('/')}`);
      return `Images + search "sample_1920" → ${n.length} tiles, kinds ${k.join('/') || '(none)'}`;
    });
    await run('MS-NEG-06', async () => { await m.searchFiles('xyz_not_found.mp4'); await settle(); expect((await names()).length).toBe(0); return `0 tiles; ${/no (files|results)|not found/i.test(await bodyText(page)) ? 'empty-state shown' : 'blank grid, no empty-state text'}`; });
    await run('MS-NEG-07', async () => { await m.searchFiles('   '); await settle(); const n = (await names()).length; return `spaces-only search → ${n} tiles (${n > 0 ? 'treated as empty search' : 'no results'})`; });
    await run('MS-NEG-08', async () => { await m.searchFiles('@@##$$'); await settle(); expect((await names()).length).toBe(0); return 'special chars → 0 tiles, no crash'; });
    await run('MS-NEG-09', async () => observed('folder isolation of search is an API defect already filed as BUG-MS-SRCH-01 (folderId ignored when search is sent); builder file browser has no per-folder search to drive in the UI'));
    await run('MS-NEG-20', async () => { await m.searchFiles(''); await m.filterFiles('images'); await settle(); const k = await kinds(); if (k.some((x) => /video/i.test(x))) return fail('video shown under Images'); return `Images filter shows ${k.join('/')} only`; });
    await m.cancelCreate().catch(() => {});

    // ───────── RATIO ─────────
    await run('MS-RATIO-01', async () => { await open(); await fillBoth(); return `Landscape format selected; landscape file assigned (zone "${(await page.getByText(/landscape · /i).first().innerText()).replace(/\s+/g, ' ')}")`; });
    await run('MS-RATIO-02', async () => `Portrait format selected; portrait file assigned (zone "${(await page.getByText(/portrait · /i).first().innerText()).replace(/\s+/g, ' ')}")`);
    await run('MS-RATIO-03', async () => { await changeRatio('portrait'); return `Change ratio → Portrait; tiles now ${(await metas(page)).length}`; });
    await run('MS-RATIO-04', async () => { await changeRatio('landscape'); return `Change ratio → Landscape; tiles now ${(await metas(page)).length}`; });
    await m.cancelCreate().catch(() => {});
    await run('MS-RATIO-05', async () => {
      const s = await seed('r05');
      await edit(s.name); await page.reload(); await page.waitForTimeout(2500);
      const t = await bodyText(page);
      expect(/landscape/i.test(t) && /portrait/i.test(t)).toBe(true);
      return 'reopened/refreshed set still shows Landscape + Portrait formats';
    });
    await m.cancelCreate().catch(() => {});
    await run('MS-RATIO-06', async () => {
      await open();
      const txt = (await bodyText(page)).match(/(add[^|]{0,20}format|custom format)/i)?.[0];
      await m.cancelCreate().catch(() => {});
      return txt ? observed(`control text present: ${txt}`) : blocked('no "Add Custom Format" control in the builder of v3.5.25 (Change ratio offers All/Landscape/Portrait/Square only)');
    });
    for (const [id, why] of [['MS-RATIO-07', 'custom-format entry'], ['MS-NEG-12', 'custom width input'], ['MS-NEG-13', 'custom height input'], ['MS-BVA-14', 'custom width input'], ['MS-BVA-15', 'custom height input'], ['MS-E2E-05', 'custom format']] as const) {
      await run(id, async () => blocked(`no ${why} exists in this build (see MS-RATIO-06)`));
    }
    await run('MS-RATIO-08', async () => {
      await open();
      const seq: string[] = [];
      for (const r of ['landscape', 'portrait', 'square', 'all']) { await changeRatio(r); seq.push(`${r}:${(await metas(page)).length}`); }
      await m.cancelCreate().catch(() => {});
      return observed(`no custom format; cycled standard ratios without error — ${seq.join(', ')}`);
    });

    // ───────── CLEAR MEDIA ─────────
    await run('MS-CLEAR-01', async () => {
      await open(); await fillBoth();
      const before = await inSet(page);
      const dlg = await clear();
      if (dlg) await dlg.getByRole('button', { name: /clear|yes|confirm|ok/i }).first().click();
      await page.waitForTimeout(800);
      const after = await inSet(page);
      await m.cancelCreate().catch(() => {});
      const msg = `2 assigned, Clear Media: "In set" ${before}→${after}; confirmation ${dlg ? 'shown' : 'NOT shown'}; no per-file selection exists`;
      if (after === 0 && before > 1) return fail(msg + ' — clears the whole set, spec expects only the selected file');
      return msg;
    });
    await run('MS-CLEAR-02', async () => blocked('Clear Media has no file multi-select; it is all-or-nothing (see MS-CLEAR-01)'));
    await run('MS-CLEAR-03', async () => {
      await open();
      const dlg = await clear(); const t = (await bodyText(page)).match(/(select|no media|nothing)[^|]{0,60}/i)?.[0] ?? '';
      if (dlg) await page.keyboard.press('Escape');
      await m.cancelCreate().catch(() => {});
      return `Clear Media with nothing assigned: no crash; confirmation ${dlg ? 'shown' : 'not shown'}; message ${t ? `"${t}"` : 'none'}`;
    });
    await run('MS-CLEAR-04', async () => {
      await open(); await fillBoth();
      const before = await inSet(page);
      const dlg = await clear();
      if (!dlg) { await m.cancelCreate().catch(() => {}); return fail('Clear Media acts immediately — no confirmation dialog to cancel'); }
      await dlg.getByRole('button', { name: /cancel|no/i }).first().click(); await page.waitForTimeout(600);
      const after = await inSet(page); await m.cancelCreate().catch(() => {});
      expect(after).toBe(before);
      return `cancel on clear confirmation: "In set" ${before}→${after}`;
    });
    await run('MS-CLEAR-05', async () => {
      const s = await seed('cl05'); await edit(s.name);
      const dlg = await clear(); if (dlg) await dlg.getByRole('button', { name: /clear|yes|confirm|ok/i }).first().click();
      await m.saveChangesBtn.click(); await page.waitForTimeout(3500);
      const d = await read(s.id);
      return observed(`edit → Clear Media → Save: stored zones ${d.zones?.length ?? 0} (was 2); editor ${await m.nameInput.isVisible().catch(() => false) ? 'still open (save blocked)' : 'closed (save accepted)'}`);
    });
    await m.cancelBtn.click().catch(() => {});
    await run('MS-NEG-10', async () => { await open(); const dlg = await clear(); if (dlg) await page.keyboard.press('Escape'); await m.cancelCreate().catch(() => {}); return `no selection: ${dlg ? 'confirmation opened' : 'no dialog, no change'}, no crash`; });
    await run('MS-NEG-11', async () => {
      await open(); await fillBoth(); const b = await inSet(page); const dlg = await clear();
      if (dlg) await dlg.getByRole('button', { name: /cancel|no/i }).first().click();
      const a = await inSet(page); await m.cancelCreate().catch(() => {});
      if (!dlg) return fail('no confirmation dialog to cancel; media cleared at once');
      expect(a).toBe(b); return 'cancel keeps media';
    });

    // ───────── E2E ─────────
    await run('MS-E2E-01', async () => { const r = await uiCreate(`${tag}_e01`); expect(r.doc).toBeDefined(); return `saved: ${(r.doc as any).zones.map((x: any) => `${x.label}:${x.file?.type}`).join(',')}`; });
    await run('MS-E2E-02', async () => {
      await open(false); const n = `${tag}_e02`; await m.nameInput.fill(n);
      await m.filterFiles('videos'); await assign(page, 'portrait'); await m.filterFiles('images'); await assign(page, 'landscape');
      await createBtn(page).click(); await page.waitForTimeout(3500);
      const d = await api.findByName(n); expect(d).toBeDefined();
      return `saved: ${(d as any).zones.map((x: any) => `${x.label}:${x.file?.type}`).join(',')}`;
    });
    await run('MS-E2E-03', async () => {
      await open(false); const n = `${tag}_e03`; await m.nameInput.fill(n);
      await m.filterFiles('videos'); await m.searchFiles('sample_1280'); await settle();
      const ks = await kinds(); await assign(page, 'landscape');
      await m.searchFiles(''); await m.filterFiles('images'); await assign(page, 'portrait');
      await createBtn(page).click(); await page.waitForTimeout(3500);
      const d: any = await api.findByName(n); expect(d).toBeDefined();
      const l = d.zones.find((z: any) => z.label === 'Landscape');
      return `search + Video filter (kinds ${ks.join('/')}) → landscape file type ${l?.file?.type}`;
    });
    await run('MS-E2E-04', async () => { await open(); await fillBoth(); const b = await inSet(page); await m.cancelCreate().catch(() => {}); return observed(`two files added ("In set" ${b}); Clear Media cannot target one file (see MS-CLEAR-01)`); });
    await run('MS-E2E-06', async () => {
      const s = await seed('e06'); await edit(s.name);
      await m.nameInput.fill(`${s.name}_v2`);
      await changeRatio('portrait');
      await m.saveChangesBtn.click(); await page.waitForTimeout(3500); await page.reload();
      const d = await read(s.id);
      return observed(`edit → rename → Change ratio(Portrait) → save → refresh: renamed=${String(d.name).endsWith('_v2')}, zones ${d.zones?.map((z: any) => z.label).join('+')}; per-file Clear not possible (MS-CLEAR-01)`);
    });

    // ───────── NEG ─────────
    await run('MS-NEG-01', async () => { const r = await uiCreate(''); expect(r.after).toBe(r.before); return `blank name rejected; message "${r.msg || 'none matched'}"`; });
    await run('MS-NEG-02', async () => { const r = await uiCreate('     '); if (r.after !== r.before) return fail('spaces-only name created a set'); return `spaces-only name rejected (${r.before}→${r.after}); message "${r.msg || 'none'}"`; });
    await run('MS-NEG-03', async () => {
      const s = await seed('dup'); const r = await uiCreate(s.name);
      const n = await count(s.name);
      if (n > 1) return fail(`duplicate name accepted — ${n} sets named "${s.name}"`);
      return `duplicate rejected; message "${r.msg}"`;
    });
    await run('MS-NEG-04', async () => {
      const r = await uiCreate(`${tag}_n04`, '     ');
      return observed(`spaces-only description: ${r.doc ? `saved as ${JSON.stringify((r.doc as any).description)}` : `not saved; "${r.msg}"`}`);
    });
    await run('MS-NEG-05', async () => {
      const r = await uiCreate('@@@@####');
      if (r.doc) { await api.deleteRaw((r.doc as any).id); return fail('special-character name "@@@@####" accepted without validation'); }
      return `rejected; message "${r.msg}"`;
    });
    await run('MS-NEG-16', async () => {
      await open(); await m.nameInput.fill(`${tag}_n16`); const b = await total();
      await createBtn(page).click(); await page.waitForTimeout(3000);
      const a = await total(); const msg = (await bodyText(page)).match(/(at least|select|add|required)[^|]{0,70}/i)?.[0] ?? '';
      await m.cancelCreate().catch(() => {});
      if (a !== b) return fail('set with no media was saved');
      return `empty set not saved (${b}→${a}); message "${msg || 'none'}"`;
    });
    await run('MS-NEG-17', async () => { const s = await seed('n17'); await m.open(); await m.searchAndSettle(s.name, 1); await m.clickDelete(s.name); await m.cancelModal(); expect(await count(s.name)).toBe(1); return 'delete → cancel: still exists'; });
    await run('MS-NEG-18', async () => {
      const s = await seed('n18'); await edit(s.name);
      await m.nameInput.fill(A(51)); await m.saveChangesBtn.click(); await page.waitForTimeout(3000);
      const len = String((await read(s.id)).name).length;
      await m.cancelBtn.click().catch(() => {});
      return len > 50 ? fail(`51-char name saved on edit (stored length ${len})`) : `51-char edit blocked; stored length ${len}`;
    });
    await run('MS-NEG-19', async () => {
      const s = await seed('n19'); await edit(s.name);
      await m.nameInput.fill(''); await m.saveChangesBtn.click(); await page.waitForTimeout(3000);
      const d = await read(s.id); const msg = (await bodyText(page)).match(/required[^|]{0,40}/i)?.[0] ?? '';
      await m.cancelBtn.click().catch(() => {});
      expect(d.name).toBe(s.name);
      return `blank-name update rejected; message "${msg || 'none'}"`;
    });
  } finally {
    await api.cleanupByPrefix(MEDIASET_PREFIX);
  }
});
