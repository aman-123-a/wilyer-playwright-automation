import { test, expect } from '@playwright/test';
import path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';
const SAMPLE_FILE    = path.resolve('data/sample.jpg');
const SAMPLE_NAME    = path.basename(SAMPLE_FILE);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 15_000 });

  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  const loginBtn = page.getByRole('button', { name: /log in/i });
  await loginBtn.click();

  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  // Fail fast if we're still on the login page
  await expect(loginBtn).toBeHidden({ timeout: 20_000 });
  console.log(`✅ Logged in as ${LOGIN_EMAIL}`);
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe('Library — File Upload', () => {

  test.setTimeout(120_000);

  test('Upload a file to Library and verify it appears', async ({ page }) => {

    // 1. Login
    await login(page);

    // 2. Navigate to Library via sidebar
    await page.getByRole('link', { name: /library/i }).first().click();
    const uploadFilesBtn = page.getByRole('button', { name: /upload files?/i });
    await expect(uploadFilesBtn).toBeVisible({ timeout: 20_000 });
    console.log('📂 On Library page');

    // 3. Click "Upload Files"
    await uploadFilesBtn.click();

    // 4. Click "Browse Files" and handle the file chooser in one step.
    //    On this app, selecting a file starts the upload automatically —
    //    no separate Submit/Open click is required.
    const browseBtn = page.getByRole('button', { name: /browse files?/i });
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      browseBtn.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_FILE);
    console.log(`📎 Selected file: ${SAMPLE_FILE}`);

    // 5. Wait for the upload dialog to close (indicates upload completed)
    await expect(browseBtn).toBeHidden({ timeout: 60_000 });
    console.log('📤 Upload dialog closed — upload finished');

    // 6. Verify the uploaded file appears in the Library media list.
    //    The app may prefix the filename (e.g. with user id), so we match
    //    on the base name substring.
    const baseName = SAMPLE_NAME.replace(/\.[^.]+$/, ''); // "sample"
    await expect(
      page.getByText(new RegExp(baseName, 'i')).first()
    ).toBeVisible({ timeout: 20_000 });

    console.log(`✅ File matching "${baseName}" visible in library`);
  });

});
