import { test, expect } from '@playwright/test';

const BASE_URL       = 'https://cms3.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

// SAFE: match ONLY explicit test-artifact name patterns. NO empty-string match.
const TEST_PATTERNS = [
  /^AL_0\d\d_\d{10,}$/,   // AL_002_..., AL_003_...
  /^AL008_/,              // emoji case
  /OR 1=1/,               // SQLi case
  /^Lx{40,}/,             // 500-char long name
];
const isTestName = (t) => {
  const s = (t ?? '').trim();
  if (s === '') return false;                  // never target empty/blank
  return TEST_PATTERNS.some((re) => re.test(s));
};

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /email|phone/i }).fill(LOGIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(LOGIN_PASSWORD);
  const btn = page.getByRole('button', { name: /log in/i });
  await btn.click();
  await expect(btn).toBeHidden({ timeout: 30_000 });
}

async function gotoAutoLogin(page) {
  await page.goto(`${BASE_URL}library`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/^\s*Widgets\s*\(\d+\)\s*$/i).first().click();
  await page.waitForTimeout(2500);
  await page.getByRole('heading', { name: /auto\s*login/i }).first().click();
  await page.waitForTimeout(2000);
}

test('cleanup: delete Auto Login test-artifact widgets (safe patterns)', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('dialog', (d) => d.accept().catch(() => {}));

  await login(page);
  await gotoAutoLogin(page);

  const names = await page.locator('p').allInnerTexts().catch(() => []);
  const targets = [...new Set(names.map((s) => s.trim()).filter(isTestName))];
  console.log('AUTO LOGIN NAMES:', JSON.stringify(names.map((s) => s.trim()).filter(Boolean).slice(0, 30)));
  console.log('TARGETS TO DELETE:', JSON.stringify(targets));

  let deleted = 0;
  for (const name of targets) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = page.locator('p', { hasText: name }).first();
      if (!(await p.count())) break;                  // gone
      const row = p.locator('xpath=..');
      const btns = row.getByRole('button');
      const n = await btns.count();
      if (n === 0) break;
      await btns.nth(n - 1).click().catch(() => {});  // delete = last icon
      await page.waitForTimeout(700);
      const confirm = page.getByRole('button', { name: /^(yes|delete|confirm|ok)$/i });
      if (await confirm.first().isVisible().catch(() => false)) await confirm.first().click();
      await page.waitForTimeout(1200);
      deleted++;
      console.log(`Deleted "${name.slice(0, 30)}"`);
      break;
    }
  }

  await page.waitForTimeout(1000);
  const after = await page.locator('p').allInnerTexts().catch(() => []);
  const remaining = [...new Set(after.map((s) => s.trim()).filter(isTestName))];
  console.log('DELETED TOTAL:', deleted);
  console.log('REMAINING TARGETS:', JSON.stringify(remaining));
});
