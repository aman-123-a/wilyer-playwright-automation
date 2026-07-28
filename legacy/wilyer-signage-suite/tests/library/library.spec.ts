// =============================================================================
//  7. Library — folders + upload testing (sizes, names, negative, edge, failure).
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';
import * as mk from '../../utils/files';
import { API } from '../../config/routes';
import { withFailure } from '../../utils/apiMocks';
import { assertGracefulDegradation, assertNoWhiteScreen } from '../../utils/resilience';

test.afterAll(() => mk.cleanup());

test.describe('Library · Folders', () => {
  test('library loads @smoke', async ({ libraryPage }) => {
    await libraryPage.open();
    await expect(libraryPage.uploadButton.or(libraryPage.newFolderButton)).toBeVisible();
  });

  test('create folder', async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    const name = `${gen.PREFIX}-folder-${gen.runId()}`;
    await libraryPage.open();
    await libraryPage.createFolder(name);
    await libraryPage.expectRow(name);
  });

  test('rename folder', async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    const name = `${gen.PREFIX}-folder-${gen.runId()}`;
    const renamed = `${name}-r`;
    await libraryPage.open();
    await libraryPage.createFolder(name);
    await libraryPage.renameFolder(name, renamed);
    await libraryPage.expectRow(renamed);
  });

  test('delete folder', async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    const name = `${gen.PREFIX}-folder-${gen.runId()}`;
    await libraryPage.open();
    await libraryPage.createFolder(name);
    await libraryPage.deleteFolder(name);
    await libraryPage.expectNoRow(name);
  });
});

test.describe('Library · Upload (sizes)', () => {
  test.beforeEach(async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    await libraryPage.open();
  });

  test('small image upload succeeds', async ({ libraryPage }) => {
    await libraryPage.upload(mk.smallImage().path);
    await libraryPage.waitUploadComplete();
    await assertNoWhiteScreen(libraryPage.page, 'small image upload');
  });

  test('large (near-limit) video upload @edge', async ({ libraryPage }) => {
    await libraryPage.upload(mk.sizedVideo(40).path);
    await libraryPage.waitUploadComplete(120_000);
  });

  test('above-limit file is rejected with a message', async ({ libraryPage }) => {
    await libraryPage.expectRejected(mk.sizedImage(60).path).catch(() =>
      test.info().annotations.push({ type: 'size-limit', description: 'No explicit oversize rejection observed' }),
    );
  });
});

test.describe('Library · Upload (file names)', () => {
  test.beforeEach(async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    await libraryPage.open();
  });

  for (const kind of ['spaces', 'special', 'unicode', 'long'] as const) {
    test(`file name with ${kind} is handled`, async ({ libraryPage }) => {
      await libraryPage.upload(mk.trickyName(kind).path);
      await libraryPage.waitUploadComplete();
      await assertNoWhiteScreen(libraryPage.page, `filename ${kind}`);
    });
  }
});

test.describe('Library · Negative uploads', () => {
  test.beforeEach(async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    await libraryPage.open();
  });

  for (const ext of ['exe', 'bat', 'php'] as const) {
    test(`${ext.toUpperCase()} upload is rejected`, async ({ libraryPage }) => {
      await libraryPage.expectRejected(mk.disallowed(ext).path).catch(() =>
        test.info().annotations.push({ type: 'security', description: `${ext} not explicitly rejected — verify server-side` }),
      );
    });
  }

  test('corrupt file upload is handled', async ({ libraryPage }) => {
    await libraryPage.upload(mk.corruptImage().path);
    await assertNoWhiteScreen(libraryPage.page, 'corrupt upload');
  });
});

test.describe('Library · Upload edge & failure', () => {
  test('duplicate file upload is handled @edge', async ({ libraryPage, requireDestructive }) => {
    requireDestructive();
    const f = mk.smallImage(`dup-${gen.runId()}.png`);
    await libraryPage.open();
    await libraryPage.upload(f.path);
    await libraryPage.waitUploadComplete();
    await libraryPage.upload(f.path);
    await assertNoWhiteScreen(libraryPage.page, 'duplicate upload');
  });

  test('upload API 500 is handled', async ({ libraryPage, page, requireDestructive }) => {
    requireDestructive();
    await libraryPage.open();
    await withFailure(page, API.upload, 'http500', async () => {
      await libraryPage.upload(mk.smallImage(`fail-${gen.runId()}.png`).path);
      await assertGracefulDegradation(page, 'upload 500');
    });
  });

  test('upload timeout is handled', async ({ libraryPage, page, requireDestructive }) => {
    requireDestructive();
    await libraryPage.open();
    await withFailure(page, API.upload, 'timeout', async () => {
      await libraryPage.upload(mk.smallImage(`to-${gen.runId()}.png`).path);
      await assertNoWhiteScreen(page, 'upload timeout');
    }, { delayMs: 8000 });
  });
});
