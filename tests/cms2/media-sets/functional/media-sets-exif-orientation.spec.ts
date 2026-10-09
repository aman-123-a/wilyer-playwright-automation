// =============================================================================
//  MEDIA SETS — EXIF orientation on image upload (changelog item 4, 2026-10-09).
//
//  "Image uploads now store EXIF-corrected width/height, so portrait phone
//  photos are saved as portrait (and match the right zone)."
//
//  A phone stores a portrait shot as LANDSCAPE pixels plus EXIF Orientation 6
//  ("rotate 90° on display"). The suite builds exactly that: a 1200×800 JPEG
//  drawn in the browser, tagged with Orientation 6 by helpers/media/exifJpeg.
//  Corrected, it must be stored as 800×1200. The same image with Orientation 1
//  is the control: it proves the pixels really are landscape, so a portrait
//  result can only come from honouring the tag.
//
//  Every upload carries a unique zzqa_exif_ stem and is deleted afterwards.
// =============================================================================

import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from '../../../../fixtures/test-fixtures';
import type { MediaSetFile, MediaSetService } from '../../../../api';
import type { LibraryPage } from '../../../../pages/LibraryPage';
import { withExifOrientation } from '../../../../helpers/media/exifJpeg';

const W = 1200;
const H = 800;

/** A unique landscape JPEG (unique pixels, so no upload de-duplication can interfere). */
async function landscapeJpeg(page: Page, label: string): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ w, h, label }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.fillStyle = '#1f5f8b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.font = 'bold 72px sans-serif';
      g.fillText(label, 60, h / 2);
      g.fillRect(0, 0, w, 40); // a "top" bar, so a viewer can see which way is up
      return c.toDataURL('image/jpeg', 0.9);
    },
    { w: W, h: H, label },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test.describe('Media Sets — EXIF orientation on upload @regression', () => {
  const uploaded: string[] = [];

  test.afterEach(async ({ mediaSetApi }) => {
    const ids = uploaded.splice(0);
    await mediaSetApi.deleteFilesQuietly(ids);
    const left = (await mediaSetApi.recentImages()).filter((f) => ids.includes(f.id));
    expect(left.map((f) => f.name), 'uploads removed from the library').toEqual([]);
  });

  /** Upload one JPEG through the Library UI and return the stored record. */
  async function upload(
    library: LibraryPage,
    api: MediaSetService,
    page: Page,
    orientation: number,
  ): Promise<MediaSetFile> {
    const stem = `zzqa_exif_o${orientation}_${Math.random().toString(36).slice(2, 8)}`;
    const path = test.info().outputPath(`${stem}.jpg`);
    await writeFile(path, withExifOrientation(await landscapeJpeg(page, stem), orientation));

    await library.open();
    const status = await library.uploadFiles(path);
    expect(status === null || status < 400, `upload answered ${status}`).toBe(true);
    await library.closeUploadDialog();

    let file: MediaSetFile | undefined;
    await expect
      .poll(
        async () => {
          file = await api.findRecentImage(stem);
          return file ? file.w * file.h : 0;
        },
        { timeout: 90_000, intervals: [3_000], message: `${stem} is listed with its dimensions` },
      )
      .toBeGreaterThan(0);
    uploaded.push(file!.id);
    return file!;
  }

  test('EXIF-01 · control: the same photo with Orientation 1 is stored landscape (1200×800)', async ({
    libraryPage,
    mediaSetApi,
    page,
  }) => {
    test.setTimeout(180_000);
    const f = await upload(libraryPage, mediaSetApi, page, 1);
    expect({ w: f.w, h: f.h }).toEqual({ w: W, h: H });
  });

  test('EXIF-02 · a portrait phone photo (Orientation 6) is stored portrait (800×1200)', async ({
    libraryPage,
    mediaSetApi,
    page,
  }) => {
    test.setTimeout(180_000);
    const f = await upload(libraryPage, mediaSetApi, page, 6);
    expect({ w: f.w, h: f.h }, 'EXIF-corrected dimensions').toEqual({ w: H, h: W });

    // The single-file read must agree with the listing.
    const one = await (await mediaSetApi.readFileRaw(f.id)).json();
    const doc = (one.file ?? one) as Partial<MediaSetFile>;
    if (doc.w !== undefined) expect({ w: doc.w, h: doc.h }).toEqual({ w: H, h: W });
  });

  test('EXIF-03 · the corrected photo is offered to the Portrait 9:16 zone, not Landscape', async ({
    libraryPage,
    mediaSetApi,
    mediaSetsPage,
    page,
  }) => {
    test.setTimeout(240_000);
    const f = await upload(libraryPage, mediaSetApi, page, 6);
    const short = f.name.slice(0, 14); // tiles truncate long names

    await mediaSetsPage.open();
    await mediaSetsPage.openCreate();
    await mediaSetsPage.searchFiles(f.name.replace(/\.[a-z]+$/i, ''));
    await mediaSetsPage.aspectPill().click();

    await mediaSetsPage.activateZone(/Portrait · 9:16/);
    await expect(mediaSetsPage.builderFiles().filter({ hasText: short }), 'listed for the portrait zone').toHaveCount(1, {
      timeout: 15_000,
    });
    await mediaSetsPage.activateZone(/Landscape · 16:9/);
    await expect(mediaSetsPage.builderFiles().filter({ hasText: short }), 'not listed for the landscape zone').toHaveCount(0, {
      timeout: 15_000,
    });
    await mediaSetsPage.cancelCreate();
  });
});
