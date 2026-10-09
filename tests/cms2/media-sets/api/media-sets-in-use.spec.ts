// =============================================================================
//  MEDIA SETS — a set that is in use: publish, delete-while-published, and
//  edit-after-publish, plus the publish endpoint's own contract. Pure HTTP.
//
//  Wire facts (observed on cms2 v3.5.25, 2026-10-09; see MediaSetService):
//  publishing copies the set's FILES onto a screen, and unpublish removes FILES
//  from screens with no reference to the set. So what a screen "holds" is read
//  back with /screen/readScreensForUnpublish per file.
//
//  Safety on the shared server: everything is published to the offline test
//  screen "aman2" only, and only with files that screen did not already hold —
//  unpublish is by file, so cleaning up a file someone else published there would
//  remove their content too. If no such file exists the suite skips.
//
//  Where the intended behaviour is not specified (does deleting a published set
//  pull its content? does editing it update the screen?) the tests assert only
//  what must hold either way — no 5xx, no data silently lost — and record the
//  observed outcome as an `observed` annotation for the product owner.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type MediaSetFile, type ScreenRef, type ZoneFiles } from '../../../../api';
import { mediaSetName } from '../../../../test-data/mediasets.data';

const TEST_SCREEN = 'aman2';
const NO_SUCH_ID = '0123456789abcdef01234567';

test.describe('Media Sets — in use on a screen @api @regression', () => {
  let screen: ScreenRef | undefined;
  let files: ZoneFiles;
  /** A second landscape image, for the edit case. */
  let spare: MediaSetFile | undefined;
  let skipReason = '';

  const created: string[] = [];
  const published = new Set<string>();

  const observe = (description: string): void => {
    test.info().annotations.push({ type: 'observed', description });
    console.log(`[observed] ${description}`);
  };

  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: testInfo.project.use.storageState });
    const api = await MediaSetService.fromContext(context);
    try {
      screen = await api.findScreen(TEST_SCREEN);
      if (!screen) {
        skipReason = `test screen "${TEST_SCREEN}" is not visible to this account`;
        return;
      }
      // Only files the screen does not already hold, so teardown can't remove anyone's content.
      const free: MediaSetFile[] = [];
      for (const f of await api.recentImages()) {
        if (!(await api.screensHolding(f.id)).includes(screen.id)) free.push(f);
        if (free.filter((x) => x.w > x.h).length >= 2 && free.some((x) => x.h > x.w)) break;
      }
      const landscapes = free.filter((f) => f.w > f.h);
      const portrait = free.find((f) => f.h > f.w);
      if (landscapes.length < 1 || !portrait) {
        skipReason = `no landscape+portrait image pair that "${TEST_SCREEN}" does not already hold`;
        return;
      }
      files = { landscape: landscapes[0], portrait };
      spare = landscapes[1];
    } finally {
      await context.close();
    }
  });

  test.beforeEach(() => {
    test.skip(!!skipReason, skipReason);
  });

  test.afterEach(async ({ mediaSetApi }) => {
    if (screen && published.size) await mediaSetApi.unpublishQuietly([...published], [screen.id]);
    published.clear();
    for (const id of created.splice(0)) await mediaSetApi.deleteQuietly(id);
  });

  /** Create a set and publish its landscape file to the test screen (the UI's own choice for aman2). */
  async function publishedSet(api: MediaSetService, label: string): Promise<string> {
    const id = await api.create(MediaSetService.payload(mediaSetName(label, test.info().workerIndex), files));
    created.push(id);
    const res = await api.publishRaw(MediaSetService.publishPayload(id, screen!.id, [files.landscape.id]));
    published.add(files.landscape.id);
    expect(res.status(), 'publish answers 200').toBe(200);
    await expect
      .poll(async () => (await api.screensHolding(files.landscape.id)).includes(screen!.id), {
        timeout: 15_000,
        message: 'the screen holds the published file',
      })
      .toBe(true);
    return id;
  }

  // ── In use ─────────────────────────────────────────────────────────────────

  test('USE-01 · publishing a set puts its file on the screen, and unpublish takes it off', async ({
    mediaSetApi,
  }) => {
    await publishedSet(mediaSetApi, 'use01');

    const res = await mediaSetApi.unpublishRaw([files.landscape.id], [screen!.id]);
    expect(res.status()).toBe(200);
    published.delete(files.landscape.id);
    await expect
      .poll(async () => (await mediaSetApi.screensHolding(files.landscape.id)).includes(screen!.id), {
        timeout: 15_000,
      })
      .toBe(false);
  });

  test('USE-02 · deleting a published set is never a 5xx and never strands the screen', async ({
    mediaSetApi,
  }) => {
    const id = await publishedSet(mediaSetApi, 'use02');

    const res = await mediaSetApi.deleteRaw(id);
    expect(res.status(), 'delete of an in-use set').toBeLessThan(500);
    const stillListed = (await mediaSetApi.list({ search: id.slice(-6), limit: 100 })).mediaSets.some(
      (m) => m.id === id,
    );
    const onScreen = (await mediaSetApi.screensHolding(files.landscape.id)).includes(screen!.id);

    if (res.ok()) {
      expect(stillListed, 'an accepted delete removes the set').toBe(false);
      observe(
        `delete of a published set answered ${res.status()}; the screen ${onScreen ? 'still holds' : 'NO LONGER holds'} its file`,
      );
    } else {
      observe(`delete of a published set was refused with ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  });

  test('USE-03 · editing a published set persists; what the screen shows afterwards is recorded', async ({
    mediaSetApi,
  }) => {
    test.skip(!spare, `needs a second landscape image that "${TEST_SCREEN}" does not hold`);
    const id = await publishedSet(mediaSetApi, 'use03');
    const name = (await mediaSetApi.list({ limit: 100, search: 'use03' })).mediaSets.find((m) => m.id === id)!.name;

    const swapped = MediaSetService.payload(name, { landscape: spare!, portrait: files.portrait });
    const res = await mediaSetApi.updateRaw(id, swapped);
    expect(res.status(), 'update of an in-use set').toBe(200);
    published.add(spare!.id); // in case the server pushed the new file to the screen

    const doc = await mediaSetApi.findByName(name);
    expect(doc?.landscapeFile?.id ?? doc?.zones.find((z) => z.label === 'Landscape')?.file).toBeTruthy();
    const zoneFile = doc!.zones.find((z) => z.label === 'Landscape')!.file;
    expect(typeof zoneFile === 'string' ? zoneFile : zoneFile.id, 'the edit persisted').toBe(spare!.id);

    const oldOnScreen = (await mediaSetApi.screensHolding(files.landscape.id)).includes(screen!.id);
    const newOnScreen = (await mediaSetApi.screensHolding(spare!.id)).includes(screen!.id);
    observe(
      `after editing a published set the screen holds the old file: ${oldOnScreen}, the new file: ${newOnScreen}`,
    );
  });

  // ── Publish contract ───────────────────────────────────────────────────────

  test('PUBAPI-01 · anonymous callers cannot publish or unpublish', async ({ mediaSetApi }) => {
    const anon = mediaSetApi.asAnonymous();
    const body = MediaSetService.publishPayload(NO_SUCH_ID, screen!.id, [files.landscape.id]);
    expect((await anon.publishRaw(body)).status()).toBe(401);
    expect((await anon.unpublishRaw([files.landscape.id], [screen!.id])).status()).toBe(401);
  });

  test('PUBAPI-02 · publishing to a screen that does not exist is a 4xx', async ({ mediaSetApi }) => {
    test.fail(true, 'BUG-MS-PUB-02: an unknown (well-formed) screen id answers 200 "published successfully"');
    const id = await mediaSetApi.create(MediaSetService.payload(mediaSetName('pub02', test.info().workerIndex), files));
    created.push(id);
    const res = await mediaSetApi.publishRaw(MediaSetService.publishPayload(id, NO_SUCH_ID, [files.landscape.id]));
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('PUBAPI-03 · a malformed screen id is a 4xx, not a 5xx', async ({ mediaSetApi }) => {
    test.fail(true, 'BUG-MS-PUB-03: a malformed screen id answers 500');
    const id = await mediaSetApi.create(MediaSetService.payload(mediaSetName('pub03', test.info().workerIndex), files));
    created.push(id);
    const res = await mediaSetApi.publishRaw(MediaSetService.publishPayload(id, 'not-an-id', [files.landscape.id]));
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('PUBAPI-04 · publishing a media set that does not exist is refused', async ({ mediaSetApi }) => {
    test.fail(true, 'BUG-MS-PUB-04: an unknown mediaSetId answers 200 and the files are pushed anyway');
    const res = await mediaSetApi.publishRaw(MediaSetService.publishPayload(NO_SUCH_ID, screen!.id, [files.landscape.id]));
    if (res.ok()) published.add(files.landscape.id);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('PUBAPI-05 · an empty publish body is a 400, not a 5xx', async ({ mediaSetApi }) => {
    const res = await mediaSetApi.publishRaw({});
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('PUBAPI-06 · unpublishing a file the screen does not hold is harmless', async ({ mediaSetApi }) => {
    const res = await mediaSetApi.unpublishRaw([files.portrait.id], [screen!.id]);
    expect(res.status()).toBeLessThan(500);
    expect((await mediaSetApi.screensHolding(files.portrait.id)).includes(screen!.id)).toBe(false);
  });
});
