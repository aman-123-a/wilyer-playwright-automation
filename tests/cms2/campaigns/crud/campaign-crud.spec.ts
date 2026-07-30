// =============================================================================
//  Campaigns V1 — CRUD suite (CMP-001…034, API-006/023)
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  Two standing rules, both learned from findings that had to be retracted
//  during exploratory testing (reports/campaigns-v1-rbac/10-*.md):
//
//   1. Persistence is proven by API read-back, never by a toast. Toast lifetime
//      (~11 s) exceeds a create loop, so a leftover toast from the previous
//      action reads as success for the current one.
//   2. Toast assertions use Playwright auto-waiting immediately after the
//      triggering click — never a sleep followed by a DOM query.
//
//  Known defects are encoded as `test.fail()` against the CORRECT behaviour, so
//  the suite stays green today and turns red the moment a bug is fixed and the
//  expectation needs flipping. Each one names its BUG-CMP id.
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

// Campaigns are only reachable through a playlist editor, so this suite borrows
// an existing playlist to host the picker. PlaylistsPage.anyPlaylistId() owns
// that lookup — it opens the playlist read-only and never saves it.

test.describe('Campaigns · CRUD', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates and deletes campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  // Remove only this worker's artefacts. The name carries the worker index, so a
  // parallel worker's in-flight campaigns are never swept out from under it, and
  // a colleague's campaigns on this shared server are never touched.
  test.afterEach(async ({ campaignApi }, testInfo) => {
    const mine = (await campaignApi.findByPrefix(CAMPAIGN_PREFIX)).filter((c) =>
      c.name.toLowerCase().includes(`_w${testInfo.workerIndex}_`),
    );
    for (const c of mine) await campaignApi.deleteQuietly(c.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Happy path — through the UI, verified at the API
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-001 · create a campaign through the picker @smoke @critical @ui', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const name = uniqueName('Create', testInfo.workerIndex);
    await campaignPicker.open(await playlistsPage.anyPlaylistId());

    const res = await campaignPicker.create(name, { items: 1, defaultDuration: DEFAULT_DURATION });

    expect(res.status, `create should reach the API — body: ${res.body} toast: ${res.toast}`).toBe(
      200,
    );

    // Identity, not counts: `totalDocs` is account-wide, so asserting a delta
    // races the other workers (and any colleague working on cms2 at the time).
    const saved = await campaignApi.findByName(name);
    expect(saved, 'campaign must exist on the server, not merely in a toast').toBeDefined();
    expect(saved!.data).toHaveLength(1);
    expect(saved!.defaultDuration ?? DEFAULT_DURATION).toBe(DEFAULT_DURATION);
  });

  test('CMP-012 · a seeded campaign is listed and readable @sanity @ui', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const name = uniqueName('Read', testInfo.workerIndex);
    const seeded = await campaignApi.seed(name, 2, DEFAULT_DURATION);

    // Read-one returns the full document, including fields the list projection omits.
    const doc = await campaignApi.read(seeded.id);
    expect(doc.name).toBe(name);
    expect(doc.data).toHaveLength(2);
    expect(doc.defaultDuration).toBe(DEFAULT_DURATION);

    // …and the UI shows it.
    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(name);
    await expect(campaignPicker.card(name)).toBeVisible({ timeout: 15_000 });
    expect(await campaignPicker.idOf(name)).toBe(seeded.id);
  });

  test('CMP-021 · rename a campaign through the picker @sanity @critical @ui', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const original = uniqueName('Before', testInfo.workerIndex);
    const renamed = uniqueName('After', testInfo.workerIndex);
    const seeded = await campaignApi.seed(original, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(original);
    const res = await campaignPicker.update(original, { name: renamed });

    expect(res.status, `update should reach the API — body: ${res.body} toast: ${res.toast}`).toBe(
      200,
    );

    const doc = await campaignApi.read(seeded.id);
    expect(doc.name, 'rename must persist server-side').toBe(renamed);
  });

  test('CMP-026 · delete a campaign through the picker @smoke @critical @ui @destructive', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const name = uniqueName('Delete', testInfo.workerIndex);
    const seeded = await campaignApi.seed(name, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(name);
    await campaignPicker.delete(name, true);

    expect(
      await campaignApi.findByName(name),
      'campaign must be gone from the server',
    ).toBeUndefined();

    // Hard delete: the record is unrecoverable, not soft-flagged.
    const readBack = await campaignApi.readRaw(seeded.id);
    expect(readBack.ok(), 'a deleted campaign must not still be readable').toBe(false);
  });

  test('CMP-027 · cancelling the delete dialog keeps the campaign @sanity @ui', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const name = uniqueName('KeepMe', testInfo.workerIndex);
    await campaignApi.seed(name, 1);

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(name);
    await campaignPicker.delete(name, false); // "Go back"

    expect(await campaignApi.findByName(name), '"Go back" must not delete').toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  API round trip
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-002 · API create → read → update → delete round trip @api @critical', async ({
    campaignApi,
  }, testInfo) => {
    const name = uniqueName('Api', testInfo.workerIndex);
    const seeded = await campaignApi.seed(name, 1, DURATIONS.valid);

    expect((await campaignApi.read(seeded.id)).name).toBe(name);

    const files = await campaignApi.sampleMediaIds(1);
    const updated = await campaignApi.updateRaw(seeded.id, {
      name: `${name}_v2`,
      data: files.map((file) => ({ file, duration: DURATIONS.minimum })),
      defaultDuration: DURATIONS.valid,
      folderId: null,
    });
    expect(updated.status(), await updated.text()).toBe(200);
    expect((await campaignApi.read(seeded.id)).name).toBe(`${name}_v2`);

    expect((await campaignApi.deleteRaw(seeded.id)).status()).toBe(200);
    expect(await campaignApi.findByName(`${name}_v2`)).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Validation that works today — these must never regress
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-009 · blank name is rejected @api @regression', async ({ campaignApi }) => {
    const files = await campaignApi.sampleMediaIds(1);
    const res = await campaignApi.createRaw({
      name: NAMES.blank,
      data: files.map((file) => ({ file, duration: DURATIONS.valid })),
      defaultDuration: DURATIONS.valid,
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/not allowed to be empty/i);
  });

  test('CMP-015 · an exact duplicate name is rejected @api @regression', async ({
    campaignApi,
  }, testInfo) => {
    const name = uniqueName('Dup', testInfo.workerIndex);
    await campaignApi.seed(name, 1);

    const files = await campaignApi.sampleMediaIds(1);
    const res = await campaignApi.createRaw({
      name,
      data: files.map((file) => ({ file, duration: DURATIONS.valid })),
      defaultDuration: DURATIONS.valid,
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/already exists/i);
  });

  test('CMP-018 · a script tag in the name renders as inert text @ui @security', async ({
    playlistsPage,
    campaignPicker,
    campaignApi,
  }, testInfo) => {
    const name = `${uniqueName('Xss', testInfo.workerIndex)}${NAMES.xss}`;
    await campaignApi.seed(name, 1);

    const dialogFired = campaignPicker.watchDialogs();

    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.search(`${CAMPAIGN_PREFIX}Xss`);
    await expect(campaignPicker.cards.first()).toBeVisible({ timeout: 15_000 });

    expect(dialogFired(), 'stored name must never execute').toBe(false);
    await expect(campaignPicker.cardScripts).toHaveCount(0);
  });

  test('CMP-005 · zero media is blocked in the UI before any request fires @ui @regression', async ({
    playlistsPage,
    campaignPicker,
  }, testInfo) => {
    const name = uniqueName('NoMedia', testInfo.workerIndex);
    await campaignPicker.open(await playlistsPage.anyPlaylistId());

    const res = await campaignPicker.create(name, { items: 0 });

    expect(res.status, 'the client must not send an empty campaign').toBeNull();
    // The guard is allowed to take either shape — a disabled submit carrying a
    // `title`, or an allowed click answered by a toast. cms2 currently disables
    // the button; asserting only the toast form made this fail on a build that
    // had in fact tightened the guard.
    expect(
      `${res.blockedReason ?? ''} ${res.toast}`,
      'the block must be explained, not silent',
    ).toMatch(/media/i);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Known defects — asserted against CORRECT behaviour and marked expected-fail.
  //  When one starts passing, Playwright fails the run: that is the signal to
  //  drop the test.fail() and close the bug.
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('known defects', () => {
    test('CMP-003 · BUG-CMP-01 · the API must reject a zero-item campaign @api @p1', async ({
      campaignApi,
    }, testInfo) => {
      test.fail(true, 'BUG-CMP-01: POST /campaign/create with data: [] returns 200');
      const res = await campaignApi.createRaw({
        name: uniqueName('ZeroItem', testInfo.workerIndex),
        data: [],
        defaultDuration: DURATIONS.valid,
      });
      expect(res.status(), 'an empty campaign is a blank frame on a customer screen').toBe(400);
    });

    test('CMP-010 · BUG-CMP-09 · a whitespace-only name must be rejected @api @p2', async ({
      campaignApi,
    }) => {
      test.fail(true, 'BUG-CMP-09: the empty check runs before trimming, so a blank name persists');
      const files = await campaignApi.sampleMediaIds(1);
      const res = await campaignApi.createRaw({
        name: NAMES.whitespace,
        data: files.map((file) => ({ file, duration: DURATIONS.valid })),
        defaultDuration: DURATIONS.valid,
      });
      const body = await res.text();

      // Clean up before asserting: on the defective build this call SUCCEEDS, so
      // the campaign it creates must be removed whichever way the assertion goes.
      // It has no QA_CRUD_ prefix, so the afterEach sweep cannot see it.
      const stray = (await campaignApi.listAll()).find((c) => c.name === NAMES.whitespace);
      if (stray) await campaignApi.deleteQuietly(stray.id);

      expect(res.status(), body).toBe(400);
      // "already exists" would mean this collided with residue rather than being
      // rejected as blank — a pass for the wrong reason.
      expect(body, 'must be rejected as blank, not as a duplicate').not.toMatch(/already exists/i);
    });

    test('CMP-008 · BUG-CMP-08 · name must be capped at 255 characters @api @p2', async ({
      campaignApi,
    }, testInfo) => {
      test.fail(true, 'BUG-CMP-08: a 1000-character name is accepted; the input has no maxlength');
      const files = await campaignApi.sampleMediaIds(1);
      const res = await campaignApi.createRaw({
        name: `${uniqueName('Long', testInfo.workerIndex)}${NAMES.overCap}`,
        data: files.map((file) => ({ file, duration: DURATIONS.valid })),
        defaultDuration: DURATIONS.valid,
      });
      expect(res.status()).toBe(400);
    });

    test('CMP-034 · BUG-CMP-04 · item duration must be at least 1 second @api @p1', async ({
      campaignApi,
    }, testInfo) => {
      test.fail(true, 'BUG-CMP-04: duration 0 and -5 are both accepted and persisted');
      const files = await campaignApi.sampleMediaIds(1);
      const res = await campaignApi.createRaw({
        name: uniqueName('ZeroDur', testInfo.workerIndex),
        data: files.map((file) => ({ file, duration: DURATIONS.zero })),
        defaultDuration: DURATIONS.valid,
      });
      expect(res.status(), 'a zero-length item is undefined behaviour on the player').toBe(400);
    });

    test('CMP-EDGE-011 · BUG-CMP-04 · the item duration input must carry min=1 @ui @p2', async ({
      playlistsPage,
      campaignPicker,
      campaignApi,
    }, testInfo) => {
      test.fail(
        true,
        'BUG-CMP-04: the per-item input has no min attribute, so typing 0 or -5 sticks',
      );
      const name = uniqueName('MinAttr', testInfo.workerIndex);
      await campaignApi.seed(name, 1);

      await campaignPicker.open(await playlistsPage.anyPlaylistId());
      await campaignPicker.search(name);
      await campaignPicker.openUpdateModal(name);

      expect(await campaignPicker.itemDurationMin(0)).toBe('1');
      await campaignPicker.dismiss(campaignPicker.updateModal);
    });

    test('BUG-CMP-10 · an invalid folderId must be rejected, not coerced to null @api @p3', async ({
      campaignApi,
    }, testInfo) => {
      test.fail(true, 'BUG-CMP-10: "notavalidid" returns 200 and is stored as null');
      const files = await campaignApi.sampleMediaIds(1);
      const res = await campaignApi.createRaw({
        name: uniqueName('BadFolder', testInfo.workerIndex),
        data: files.map((file) => ({ file, duration: DURATIONS.valid })),
        defaultDuration: DURATIONS.valid,
        folderId: 'notavalidid',
      });
      expect(res.status()).toBe(400);
    });

    test('API-023 · BUG-CMP-12 · deleting a missing campaign should be 404 @api @p3', async ({
      campaignApi,
    }, testInfo) => {
      test.fail(true, 'BUG-CMP-12: a second delete returns 400 "Campaign not found."');
      const seeded = await campaignApi.seed(uniqueName('Idem', testInfo.workerIndex), 1);
      expect((await campaignApi.deleteRaw(seeded.id)).status()).toBe(200);
      expect((await campaignApi.deleteRaw(seeded.id)).status()).toBe(404);
    });

    test('BUG-CMP-11 · search must trim the query @api @p3', async ({ campaignApi }, testInfo) => {
      test.fail(true, 'BUG-CMP-11: a padded query returns 0 results');
      const name = uniqueName('Trim', testInfo.workerIndex);
      await campaignApi.seed(name, 1);
      const padded = await campaignApi.list({ search: `  ${name}  ` });
      expect(padded.totalDocs).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Fixed since the 2026-07-28 exploratory run — verified 2026-07-28, later
  //  session. Kept as regression guards: these are the assertions that catch a
  //  re-introduction.
  // ───────────────────────────────────────────────────────────────────────────

  test('CMP-016 · name uniqueness is case-insensitive @api @regression', async ({
    campaignApi,
  }, testInfo) => {
    // Was BUG-CMP-07 — `Vansh 1` / `vansh 1` coexisted in real production data.
    const name = uniqueName('Case', testInfo.workerIndex);
    await campaignApi.seed(name, 1);

    const files = await campaignApi.sampleMediaIds(1);
    const res = await campaignApi.createRaw({
      name: name.toLowerCase(),
      data: files.map((file) => ({ file, duration: DURATIONS.valid })),
      defaultDuration: DURATIONS.valid,
    });
    expect(res.status(), await res.text()).toBe(400);
  });

  test('API-006 · omitting sort/order does not error @api @regression', async ({ campaignApi }) => {
    // Was BUG-CMP-03 — the identical query returned 500.
    const res = await campaignApi.listRawQuery('limit=50&page=1&search=&folderId=');
    expect(res.status(), 'optional query params must default, not crash').toBeLessThan(500);
  });

  test('SEC-006 · search metacharacters are treated as literal text @api @security @regression', async ({
    campaignApi,
  }, testInfo) => {
    // Was BUG-CMP-02 — `search` went into a Mongo regex unescaped, so `.*`
    // returned the entire collection. Compared against a literal control rather
    // than global totalDocs, which would race other workers.
    const name = uniqueName('Regex', testInfo.workerIndex);
    await campaignApi.seed(name, 1);

    const literal = await campaignApi.list({ search: name });
    const wildcard = await campaignApi.list({ search: '.*' });

    expect(literal.totalDocs, 'the literal control must match exactly one campaign').toBe(1);
    expect(
      wildcard.totalDocs,
      '`.*` must match names literally containing ".*", not the whole collection',
    ).toBeLessThanOrEqual(literal.totalDocs);
  });

  /**
   * The `duration` rollup on read-one. A pre-existing campaign on cms2 with items
   * of 30, 28 and 28 seconds reports `duration: 302828` — the digits concatenated
   * rather than summed. This test covers both write paths with MIXED durations
   * (equal durations cannot tell a sum from a concatenation apart cleanly), so if
   * the concatenation is real, it is caught at the path that produces it.
   */
  test('CMP-030 · the duration rollup is the numeric sum of its items @api @regression', async ({
    campaignApi,
  }, testInfo) => {
    const seeded = await campaignApi.seed(uniqueName('Rollup', testInfo.workerIndex), 3, 10);
    const files = (await campaignApi.read(seeded.id)).data.map((i) => i.file.id);

    const sumOf = (doc: { data: Array<{ duration: number }> }) =>
      doc.data.reduce((total, item) => total + item.duration, 0);

    const afterCreate = await campaignApi.read(seeded.id);
    expect(Number(afterCreate.duration), 'rollup after create').toBe(sumOf(afterCreate));

    // Mixed values: 30/28/28 sums to 86 but concatenates to 302828.
    const mixed = [30, 28, 28];
    const res = await campaignApi.updateRaw(seeded.id, {
      name: seeded.name,
      data: files.map((file, i) => ({ file, duration: mixed[i] })),
      defaultDuration: DURATIONS.valid,
      folderId: null,
    });
    expect(res.status(), await res.text()).toBe(200);

    const afterUpdate = await campaignApi.read(seeded.id);
    expect(Number(afterUpdate.duration), 'rollup after update').toBe(sumOf(afterUpdate));
  });
});
