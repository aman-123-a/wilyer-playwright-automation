import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

const HUGE_FILE      = path.resolve('data/huge_file.zip');
const HUGE_NAME      = path.basename(HUGE_FILE);
const HUGE_SIZE      = 1024 * 1024 * 1024; // 1 GB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createSparseFile(filePath, size) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, 'w');
  try {
    // Seek to size-1 and write a single byte — creates a sparse file instantly
    // on NTFS/ext4 without actually writing 1 GB of data to disk.
    fs.writeSync(fd, Buffer.from([0]), 0, 1, size - 1);
  } finally {
    fs.closeSync(fd);
  }
  const actual = fs.statSync(filePath).size;
  console.log(`🗜️  Created sparse file ${filePath} (${actual} bytes)`);
}

function removeFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Deleted ${filePath}`);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to delete ${filePath}: ${err.message}`);
  }
}

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 15_000 });

  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  const loginBtn = page.getByRole('button', { name: /log in/i });
  await loginBtn.click();

  await expect(loginBtn).toBeHidden({ timeout: 20_000 });
  console.log(`✅ Logged in as ${LOGIN_EMAIL}`);
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe('Library — Negative Load/Size Test (1 GB file)', () => {

  test.setTimeout(180_000);

  test.beforeAll(() => {
    createSparseFile(HUGE_FILE, HUGE_SIZE);
  });

  test.afterAll(() => {
    // Crucial: always clean up the 1 GB artifact, pass or fail.
    removeFile(HUGE_FILE);
  });

  test('Rejects a 1 GB upload with an error and does not add it to Library', async ({ page }) => {

    // Capture any 413 / size-related HTTP responses from the upload.
    const oversizedResponses = [];
    page.on('response', (res) => {
      if (res.status() === 413) {
        oversizedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Login
    await login(page);

    // 2. Navigate to Library
    await page.goto(`${BASE_URL}library`, { waitUntil: 'domcontentloaded' });
    const uploadFilesBtn = page.getByRole('button', { name: /upload files?/i });
    await expect(uploadFilesBtn).toBeVisible({ timeout: 20_000 });
    console.log('📂 On Library page');

    // 3. Open upload dialog
    await uploadFilesBtn.click();

    // 4. Browse + filechooser — setFiles auto-starts the upload on this CMS.
    const browseBtn = page.getByRole('button', { name: /browse files?/i });
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      browseBtn.click(),
    ]);
    await fileChooser.setFiles(HUGE_FILE);
    console.log(`📎 Selected oversized file: ${HUGE_FILE}`);

    // 5. Negative assertion — wait for an error surface (toast / inline / 413).
    //    High timeout (60s) for slow networks / server-side size checks.
    const errorRegex = /file\s*size|too\s*large|limit\s*exceeded|exceeds|maximum|413|request entity too large/i;
    const errorLocator = page.getByText(errorRegex).first();

    let uiErrorShown = false;
    try {
      await expect(errorLocator).toBeVisible({ timeout: 60_000 });
      uiErrorShown = true;
      console.log(`🚫 UI error displayed: "${(await errorLocator.textContent())?.trim()}"`);
    } catch {
      console.log('ℹ️  No inline UI error located — falling back to HTTP 413 check');
    }

    // Accept either a visible UI error OR a 413 network response as proof of rejection.
    expect(
      uiErrorShown || oversizedResponses.length > 0,
      `Expected a size-limit error (UI message or HTTP 413). 413s seen: ${oversizedResponses.length}`
    ).toBeTruthy();

    if (oversizedResponses.length) {
      console.log(`🌐 413 responses: ${oversizedResponses.join(', ')}`);
    }

    // 6. Dismiss the upload dialog if still open, then assert the file is NOT in the media list.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1000);

    const baseName = HUGE_NAME.replace(/\.[^.]+$/, ''); // "huge_file"
    const mediaMatch = page.getByText(new RegExp(baseName, 'i'));
    await expect(mediaMatch).toHaveCount(0, { timeout: 10_000 });
    console.log(`✅ "${baseName}" is NOT present in the Library media list (as expected)`);
  });

});
