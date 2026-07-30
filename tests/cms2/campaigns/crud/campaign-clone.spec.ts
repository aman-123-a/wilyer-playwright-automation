// =============================================================================
//  Campaigns V1 — CLONE (CMP-025, CMP-041).
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── Why this file exists ────────────────────────────────────────────────────
//  FR-CMP-07 ("duplicate/clone a campaign") was the last requirement recorded as
//  only partially covered: doc 06 §"FR-CMP-07" says "feature presence unconfirmed
//  on cms2". It is present. Mapped live 2026-07-30:
//
//      the card's clipboard button → modal #copyCampaign, one field
//      submit                     → POST /campaign/duplicate/{id}
//                                   body {name, folderId} — NO item payload
//      success                    → 200 {"message":"Campaign copied successfully."}
//
//  The absent item payload is what makes clone worth testing separately from
//  create: the copy's contents are composed entirely server-side, so the client
//  cannot be the reason the items, their order or their durations come out right.
//  That is the invariant CMP-041 asserts.
//
//  ── Two client-side-only guards ─────────────────────────────────────────────
//  A blank name and a duplicate name are both refused in the browser with NO
//  request issued. That is fine as UX and useless as authorization, so each has
//  a matching API case here that asks the server the same question directly.
//
//  Standing rules inherited from the CRUD suite: persistence is proven by API
//  read-back, never by a toast; toast waits are armed before the click.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import {
  CAMPAIGN_PREFIX,
  DEFAULT_DURATION,
  DURATIONS,
  NAMES,
  uniqueName,
} from '../../../../test-data/campaigns.data';

test.describe('Campaigns · clone', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates and deletes campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  // Sweep only this worker's artefacts, so a parallel worker's in-flight
  // campaigns — and a colleague's work on this shared server — are left alone.
  test.afterEach(async ({ campaignApi }, testInfo) => {
    const mine = (await campaignApi.findByPrefix(CAMPAIGN_PREFIX)).filter((c) =>
      c.name.toLowerCase().includes(`_w${testInfo.workerIndex}_`),
    );
    for (const c of mine) await campaignApi.deleteQuietly(c.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Happy path — through the UI, verified at the API
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-025 · clone a campaign through the picker @smoke @critical @ui', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneSrc', testInfo.workerIndex);
    const copy = uniqueName('CloneCopy', testInfo.workerIndex);
    const seeded = await campaignApi.seed(source, 2, DEFAULT_DURATION);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(source);
    const res = await campaignPicker.clone(source, copy);

    expect(res.status, `clone should reach the API — body: ${res.body} toast: ${res.toast}`).toBe(
      200,
    );

    const cloned = await campaignApi.findByName(copy);
    expect(cloned, 'the copy must exist on the server, not merely in a toast').toBeDefined();

    // A clone is a copy, not a move: the source has to survive it.
    expect(
      await campaignApi.findByName(source),
      'cloning must leave the source campaign untouched',
    ).toBeDefined();
    expect((await campaignApi.read(seeded.id)).name, 'the source keeps its own name').toBe(source);
  });

  test('CMP-041 · a clone reproduces the items, their order and their durations @critical @api', async ({
    campaignApi,
  }, testInfo) => {
    // Mixed, ordered durations on purpose. Equal durations cannot tell a faithful
    // copy from a re-defaulted one, and an unordered comparison cannot tell a
    // preserved sequence from a reshuffled set — both are the failures that
    // matter on a screen, where order IS the content.
    const source = uniqueName('CloneOrder', testInfo.workerIndex);
    const copy = `${source}_copy`;
    const files = await campaignApi.sampleMediaIds(3);
    const durations = [7, 21, 14];

    const created = await campaignApi.createRaw({
      name: source,
      data: files.map((file, i) => ({ file, duration: durations[i] })),
      defaultDuration: DEFAULT_DURATION,
      folderId: null,
    });
    expect(created.status(), await created.text()).toBe(200);
    const seeded = await campaignApi.findByName(source);
    expect(seeded, 'the source must be seeded before it can be cloned').toBeDefined();

    const cloned = await campaignApi.duplicate(seeded!.id, copy);
    const before = await campaignApi.read(seeded!.id);
    const after = await campaignApi.read(cloned.id);

    expect(after.name, 'the copy takes the requested name').toBe(copy);
    expect(after.data, 'the copy must hold the same number of items').toHaveLength(
      before.data.length,
    );
    expect(
      after.data.map((i) => i.file.id),
      'the copy must reference the same media in the same order',
    ).toEqual(before.data.map((i) => i.file.id));
    expect(
      after.data.map((i) => i.duration),
      'per-item durations must be copied, not reset to the default',
    ).toEqual(durations);
    expect(after.defaultDuration, 'the default duration carries over').toBe(
      before.defaultDuration ?? DEFAULT_DURATION,
    );

    // Distinct records, not two names for one document. If they shared storage,
    // editing the copy would silently rewrite the original.
    expect(after.id, 'the copy must be its own record').not.toBe(before.id);
  });

  test('CMP-025b · the copy is independent — editing it does not touch the source @critical @api', async ({
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneIndep', testInfo.workerIndex);
    const copy = `${source}_copy`;
    const seeded = await campaignApi.seed(source, 2, DEFAULT_DURATION);
    const cloned = await campaignApi.duplicate(seeded.id, copy);

    // Rewrite the copy down to a single short item — as different from the
    // source as the schema allows.
    const trimmed = await campaignApi.updateRaw(cloned.id, {
      name: `${copy}_edited`,
      data: [{ file: (await campaignApi.read(cloned.id)).data[0].file.id, duration: DURATIONS.minimum }],
      defaultDuration: DURATIONS.minimum,
      folderId: null,
    });
    expect(trimmed.status(), await trimmed.text()).toBe(200);

    const original = await campaignApi.read(seeded.id);
    expect(original.name, 'the source name must not follow the copy').toBe(source);
    expect(original.data, 'the source items must not follow the copy').toHaveLength(2);
    expect(original.data[0].duration, 'the source durations must not follow the copy').toBe(
      DEFAULT_DURATION,
    );
  });

  test('CMP-025c · a clone can itself be cloned, and deleted independently @api @regression @destructive', async ({
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneChain', testInfo.workerIndex);
    const first = `${source}_c1`;
    const second = `${source}_c2`;

    const seeded = await campaignApi.seed(source, 2, DEFAULT_DURATION);
    const c1 = await campaignApi.duplicate(seeded.id, first);
    const c2 = await campaignApi.duplicate(c1.id, second);

    expect((await campaignApi.read(c2.id)).data, 'a clone of a clone keeps the contents').toHaveLength(
      2,
    );

    // Deleting the middle link must not cascade in either direction.
    expect((await campaignApi.deleteRaw(c1.id)).status()).toBe(200);
    expect(
      await campaignApi.findByName(source),
      'deleting a copy must not delete the campaign it came from',
    ).toBeDefined();
    expect(
      await campaignApi.findByName(second),
      'deleting a copy must not delete the copy made from it',
    ).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The modal's own behaviour
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-025d · the clone modal names the campaign it is about @ui @regression', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    // #copyCampaign is ONE shared instance reused by every card, and its only
    // indication of which campaign it will copy is the source name in its
    // heading. If that binding is wrong the user clones something else entirely
    // — and the name field starts empty, so nothing else on screen would say so.
    const a = uniqueName('CloneBindA', testInfo.workerIndex);
    const b = uniqueName('CloneBindB', testInfo.workerIndex);
    await campaignApi.seed(a, 1);
    await campaignApi.seed(b, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(`${CAMPAIGN_PREFIX}CloneBind`);

    await campaignPicker.openCloneModal(a);
    expect(await campaignPicker.cloneModalTitle()).toContain(a);
    await expect(
      campaignPicker.cloneNameInput,
      'the field starts empty, so the heading is the only binding evidence the user gets',
    ).toHaveValue('');
    await campaignPicker.closeCloneModal();

    await campaignPicker.openCloneModal(b);
    const title = await campaignPicker.cloneModalTitle();
    expect(title, 'reopening for another card must rebind the modal').toContain(b);
    expect(title, 'and must not still be showing the previous campaign').not.toContain(a);
    await campaignPicker.closeCloneModal();
  });

  test('CMP-025e · a blank clone name is refused before any request is sent @ui @regression', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneBlank', testInfo.workerIndex);
    await campaignApi.seed(source, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(source);
    const res = await campaignPicker.clone(source, NAMES.blank);

    expect(res.status, 'the client must not send a nameless clone').toBeNull();
    expect(res.toast, 'the refusal must be explained, not silent').toMatch(/name cannot be empty/i);

    // And nothing was created under any name — a guard that still writes is worse
    // than no guard, because the operator is told it did not happen.
    const family = (await campaignApi.findByPrefix(CAMPAIGN_PREFIX)).filter((c) =>
      c.name.includes('CloneBlank'),
    );
    expect(family.map((c) => c.name), 'only the source should exist').toEqual([source]);
  });

  test('CMP-025f · cloning onto an existing name is refused @ui @regression', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneDup', testInfo.workerIndex);
    const seeded = await campaignApi.seed(source, 2);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(source);
    // Clone onto the source's OWN name — the collision a user hits by pressing
    // Clone and then Enter without thinking.
    const res = await campaignPicker.clone(source, source);

    expect(res.status, 'the collision is caught client-side, so no request is issued').toBeNull();
    expect(res.toast).toMatch(/already exists/i);

    // The source must be intact — not overwritten by a half-completed copy.
    const doc = await campaignApi.read(seeded.id);
    expect(doc.data, 'a refused clone must not modify the campaign it was cloning').toHaveLength(2);
  });

  test('CMP-025g · a rejected clone closes the modal, but keeps the name for correction @ui @defect', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneModal', testInfo.workerIndex);
    await campaignApi.seed(source, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(source);
    await campaignPicker.openCloneModal(source);
    await campaignPicker.cloneNameInput.fill(source); // a name that will be refused
    await campaignPicker.cloneModal
      .getByRole('button', { name: /clone campaign/i })
      .first()
      .click();

    // The submit button carries data-bs-dismiss="modal", so Bootstrap closes the
    // dialog before the app has decided whether to accept the name. Asserted as
    // observed, per this repo's convention: the guard itself works, but the user
    // is dropped back to the list and has to reopen the dialog to fix a typo.
    // Correct behaviour is to keep a rejected dialog open on the failing field.
    await expect(
      campaignPicker.cloneModal,
      'BUG-CMP-CLONE-01: the clone dialog closes even when the name is rejected — ' +
        'data-bs-dismiss on the submit button fires regardless of the outcome, so the ' +
        'error arrives after the form the user needs to correct has already gone.',
    ).not.toHaveClass(/show/, { timeout: 15_000 });

    // The one thing that keeps this a nuisance rather than data loss: the field
    // holds its value, so reopening the dialog shows the rejected name ready to
    // edit. That is worth pinning down — if a later build "fixes" the dismiss by
    // resetting the form instead, the typo would have to be retyped from scratch
    // and this assertion is what catches the regression.
    await campaignPicker.openCloneModal(source);
    await expect(
      campaignPicker.cloneNameInput,
      'a rejected name must survive the forced close so it can be corrected',
    ).toHaveValue(source);
    await campaignPicker.closeCloneModal();
  });

  test('CMP-025m · the clone dialog has no keyboard exit @ui @a11y @defect', async ({
    page,
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneExit', testInfo.workerIndex);
    await campaignApi.seed(source, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(source);
    await campaignPicker.openCloneModal(source);

    // #copyCampaign is declared data-bs-keyboard="false" data-bs-backdrop="static",
    // so neither Escape nor a backdrop click closes it. On its own that is a
    // legitimate choice for a form that would lose data — it is the combination
    // with the next assertion that makes it a defect.
    await page.keyboard.press('Escape');
    await expect(
      campaignPicker.cloneModal,
      'Escape is disabled on this dialog by design (data-bs-keyboard="false")',
    ).toHaveClass(/show/, { timeout: 5_000 });

    // …and the only way out is a <span>. Not a <button>, no role, no tabindex —
    // so it is not reachable by keyboard at all. With Escape disabled, a keyboard
    // or screen-reader user who opens this dialog can only leave it by submitting
    // the form, which either creates a campaign they did not want or produces an
    // error. Every other modal in the picker is escapable via its own control.
    const closer = campaignPicker.cloneModal.locator('#closecopyCampaign');
    const shape = await closer.evaluate((e) => ({
      tag: e.tagName,
      role: e.getAttribute('role'),
      tabindex: e.getAttribute('tabindex'),
    }));
    expect(
      shape,
      'BUG-CMP-CLONE-02: the clone dialog\'s only exit is a non-focusable <span> and ' +
        'Escape is disabled, so there is no keyboard route out of the dialog. The close ' +
        'control must be a <button> (or carry role+tabindex), or Escape must be allowed.',
    ).toEqual({ tag: 'SPAN', role: null, tabindex: null });

    await campaignPicker.closeCloneModal();
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  The API behind it — the guards above are client-side only, so ask directly
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-025h · the API refuses a duplicate clone name @api @critical', async ({
    campaignApi,
  }, testInfo) => {
    const source = uniqueName('CloneApiDup', testInfo.workerIndex);
    const seeded = await campaignApi.seed(source, 1);

    const res = await campaignApi.duplicateRaw(seeded.id, { name: source, folderId: '' });
    expect(
      res.status(),
      `the browser blocks this collision, but the endpoint must enforce it too — ${await res.text()}`,
    ).toBe(400);
    expect(await res.text()).toMatch(/already exists/i);
  });

  test('CMP-025i · the API refuses a blank clone name @api @regression', async ({
    campaignApi,
  }, testInfo) => {
    const seeded = await campaignApi.seed(uniqueName('CloneApiBlank', testInfo.workerIndex), 1);
    const res = await campaignApi.duplicateRaw(seeded.id, { name: NAMES.blank, folderId: '' });
    expect(
      res.status(),
      `a nameless campaign is unusable in the picker — ${await res.text()}`,
    ).toBe(400);
  });

  test('CMP-025j · cloning a campaign that does not exist is refused @api @negative', async ({
    campaignApi,
  }, testInfo) => {
    const res = await campaignApi.duplicateRaw('000000000000000000000000', {
      name: uniqueName('CloneGhost', testInfo.workerIndex),
      folderId: '',
    });
    expect(res.status(), 'a well-formed but unknown id must not be treated as a hit').toBeGreaterThanOrEqual(
      400,
    );
    expect(res.status(), 'and it must not fall through to a server error').toBeLessThan(500);
  });

  test('CMP-025k · an anonymous caller cannot clone @api @security @critical', async ({
    campaignApi,
  }, testInfo) => {
    const seeded = await campaignApi.seed(uniqueName('CloneAnon', testInfo.workerIndex), 1);
    const res = await campaignApi
      .asAnonymous()
      .duplicateRaw(seeded.id, { name: `${seeded.name}_anon`, folderId: '' });

    expect(
      res.status(),
      'clone is a write: without credentials it must be refused like create and delete',
    ).toBeGreaterThanOrEqual(401);
    expect(
      await campaignApi.findByName(`${seeded.name}_anon`),
      'and nothing may be written',
    ).toBeUndefined();
  });

  test('CMP-025l · a script tag in a clone name is stored inertly @ui @security', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    // The create path is covered by CMP-018. Clone is a SECOND write path into
    // the same field, and a payload that create escapes can still land unescaped
    // here — the guard has to be at the sink, not at one entry point.
    const source = uniqueName('CloneXssSrc', testInfo.workerIndex);
    const copy = `${uniqueName('CloneXss', testInfo.workerIndex)}${NAMES.xss}`;
    await campaignApi.seed(source, 1);

    const dialogFired = campaignPicker.watchDialogs();

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(source);
    const res = await campaignPicker.clone(source, copy);
    expect(res.status, `clone should be accepted — ${res.body}`).toBe(200);

    await campaignPicker.search(`${CAMPAIGN_PREFIX}CloneXss`);
    await expect(campaignPicker.cards.first()).toBeVisible({ timeout: 15_000 });

    expect(dialogFired(), 'a name written through clone must never execute').toBe(false);
    await expect(campaignPicker.cardScripts).toHaveCount(0);
  });
});
