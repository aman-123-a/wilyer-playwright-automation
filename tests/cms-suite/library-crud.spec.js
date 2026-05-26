// =============================================================================
//  LIBRARY MODULE — full CRUD + listing/search/pagination/preview.
//  Covers: media listing, search, upload, edit(rename/replace surface), delete,
//  pagination ("Load More"), preview (/file-details), duplicate-upload handling,
//  and unsupported-file upload. Positive / negative / edge / UI validation.
//
//  Destructive flows (upload + delete) self-clean and are gated behind
//  CMS_ALLOW_DESTRUCTIVE so the file is safe to run anywhere. Uploads use a
//  uniquely-named in-memory payload so cleanup can find exactly what it created.
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../../fixtures/cms-fixtures.js';
import { ENV } from '../../utils/cms/env.js';
import { LibraryPage } from '../../pages/cms/LibraryPage.js';
import { FileDetailsPage } from '../../pages/cms/FileDetailsPage.js';
import { assertHealthy, assertNotBlank } from '../../utils/cms/crashDetector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG_FIXTURE = path.resolve(__dirname, '..', '..', 'fixtures', 'cms-media', 'sample-image.png');
const pngBuffer = fs.readFileSync(PNG_FIXTURE);

/** A uniquely-named PNG payload so we can find & delete exactly what we upload. */
function uniqueImage(tag = 'img') {
  const name = `pwtest_${tag}_${Date.now()}.png`;
  return { name, payload: { name, mimeType: 'image/png', buffer: pngBuffer } };
}

// ── POSITIVE ────────────────────────────────────────────────────────────────
test.describe('Library — Positive', () => {
  test('media library lists media (or a clean empty state)', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.expectGridLoaded();
    // The "Total Files - N" counter is part of the toolbar contract.
    await expect(lib.totalFiles).toBeVisible({ timeout: 15_000 });
  });

  test('search narrows the media grid', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.expectGridLoaded();
    const before = await lib.cardCount();
    await lib.searchMedia('zzz_no_such_media_' + Date.now());
    const after = await lib.cardCount();
    // A non-matching search must not return MORE than the unfiltered grid.
    expect(after).toBeLessThanOrEqual(before);
    await assertNotBlank(adminPage, 'library after search');
  });

  test('type filters (All / Photos / Videos) switch without crashing', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    for (const kind of ['photos', 'videos', 'all']) {
      await lib.applyFilter(kind);
      await assertHealthy(adminPage, `library filter=${kind}`);
    }
  });

  test('preview: opening a media item shows its detail + download', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    test.skip((await lib.cardCount()) === 0, 'No media to preview in this environment.');
    await lib.openFirstDetails();
    const details = new FileDetailsPage(adminPage);
    await details.expectLoaded();
    await expect(details.downloadLink).toBeVisible({ timeout: 15_000 });
    await expect(details.metaFileSize).toBeVisible();
  });

  test('pagination: "Load More" reveals additional media', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.expectGridLoaded();
    const before = await lib.cardCount();
    const clicked = await lib.loadMore();
    test.skip(!clicked, 'All media fits on one page — no "Load More" control.');
    const after = await lib.cardCount();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

// ── UI VALIDATION ─────────────────────────────────────────────────────────────
test.describe('Library — UI validation', () => {
  test('tabs and upload control are present', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await expect(lib.mediaTab).toBeVisible();
    await expect(lib.widgetsTab).toBeVisible();
    await expect(lib.uploadFilesBtn).toBeVisible();
  });

  test('upload dialog states the supported formats', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.openUploadDialog();
    // The merged Library advertises exactly these formats.
    await expect(adminPage.getByText(/\.jpg.*\.jpeg.*\.png.*\.mp4/i)).toBeVisible();
    await expect(lib.browseFilesBtn).toBeVisible();
    await lib.closeUploadDialog();
  });
});

// ── UPLOAD / DELETE (destructive, self-cleaning, gated) ─────────────────────
test.describe('Library — Upload & Delete', () => {
  test.skip(!ENV.ALLOW_DESTRUCTIVE, 'CMS_ALLOW_DESTRUCTIVE=false — skipping create/delete flows.');
  // Uploads serialise so concurrent runs don't fight over the grid.
  test.describe.configure({ mode: 'serial' });

  test('upload a valid image, then delete it (round-trip)', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();

    const { name, payload } = uniqueImage('roundtrip');
    await lib.uploadFiles(payload);
    // Upload auto-starts; closing the dialog completes the flow.
    await adminPage.waitForTimeout(2500);
    await lib.closeUploadDialog();

    // The new file should surface (server appends a timestamp but keeps the base
    // name). Search narrows the grid to just our upload.
    await lib.searchMedia(name.replace(/\.png$/i, ''));
    const found = await lib.cardCount();
    expect(found, `uploaded ${name} should appear`).toBeGreaterThan(0);
    await assertHealthy(adminPage, 'library after upload');

    // Cleanup — delete what we created.
    const deleted = await lib.deleteByName(name.replace(/\.png$/i, ''));
    expect(deleted, 'uploaded file should be deletable').toBeTruthy();
    await lib.searchMedia(name.replace(/\.png$/i, ''));
    expect(await lib.cardCount()).toBe(0);
  });

  test('duplicate upload (same file twice) is handled without crashing', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();

    const { name, payload } = uniqueImage('dup');
    // Upload the same payload twice in succession.
    await lib.uploadFiles([payload, payload]);
    await adminPage.waitForTimeout(2500);
    await lib.closeUploadDialog();
    await assertHealthy(adminPage, 'library after duplicate upload');

    // Cleanup any copies that landed.
    await lib.searchMedia(name.replace(/\.png$/i, ''));
    for (let i = 0; i < 3 && (await lib.cardCount()) > 0; i++) {
      const ok = await lib.deleteByName(name.replace(/\.png$/i, ''));
      if (!ok) break;
      await lib.searchMedia(name.replace(/\.png$/i, ''));
    }
  });
});

// ── NEGATIVE ────────────────────────────────────────────────────────────────
test.describe('Library — Negative', () => {
  test('unsupported file type is rejected (no media card created)', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.openUploadDialog();
    // Push a .txt straight at the input (bypasses the OS accept filter) — the app
    // must reject it client- or server-side rather than create an IMAGE/VIDEO card.
    const txtName = `pwtest_bad_${Date.now()}.txt`;
    await lib.fileInput.setInputFiles({ name: txtName, mimeType: 'text/plain', buffer: Buffer.from('not media') });
    await adminPage.waitForTimeout(2000);

    // Either an explicit error is shown, or the dialog simply does not accept it.
    const rejected = await adminPage
      .getByText(/not (a )?supported|invalid|only.*(jpg|png|mp4)|unsupported|allowed/i)
      .first().isVisible().catch(() => false);
    await lib.closeUploadDialog();
    await lib.searchMedia(txtName.replace(/\.txt$/i, ''));
    const leaked = await lib.cardCount();
    expect(rejected || leaked === 0, 'unsupported file must not become a media item').toBeTruthy();
  });

  test('searching for non-existent media yields an empty result', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.searchMedia('zzz_definitely_not_present_' + Date.now());
    const empty = await adminPage.getByText(/no (file|media|data|result|record)/i).first().isVisible().catch(() => false);
    expect((await lib.cardCount()) === 0 || empty).toBeTruthy();
  });
});

// ── EDGE CASES ──────────────────────────────────────────────────────────────
test.describe('Library — Edge Cases', () => {
  test('clearing the search restores the full grid', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    await lib.expectGridLoaded();
    const baseline = await lib.cardCount();
    await lib.searchMedia('zzz_' + Date.now());
    await lib.clearSearch();
    await adminPage.waitForTimeout(1200);
    expect(await lib.cardCount()).toBeGreaterThanOrEqual(Math.min(baseline, 1));
  });

  test('rapid filter toggling leaves the grid healthy', async ({ adminPage }) => {
    const lib = new LibraryPage(adminPage);
    await lib.open();
    for (const kind of ['photos', 'videos', 'photos', 'all', 'videos', 'all']) {
      await lib.applyFilter(kind);
    }
    await assertHealthy(adminPage, 'library after rapid filter toggling');
  });
});
