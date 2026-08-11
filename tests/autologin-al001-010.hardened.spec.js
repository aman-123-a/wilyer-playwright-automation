import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// =============================================================================
//  Auto Login Widget — Widget Name / URL validation (AL-001 .. AL-010)  [HARDENED]
//  Library → Widgets → Auto Login → Add New.  Fields: Widget Name* , WebPage URL.
//
//  Improvements over autologin-validation.spec.js:
//   • VALID_URL = https://example.com  (no Google-Sheets iframe 401/403/CSP noise)
//   • "crash" = ONLY same-origin (cms3) pageerror/console-error — third-party
//     iframe errors are ignored, so verdicts reflect the CMS, not embedded sites.
//   • Detects BUG-3 (form does not reset) by reading field values on each open.
//   • ACCEPT cases verify the widget actually appears in the list (emoji render).
//   • Verdict is outcome-vs-expectation, not "any console error => FAIL".
// =============================================================================

const BASE_URL       = 'https://cms.wilyersignage.com/';
const APP_HOST       = 'cms.wilyersignage.com';
const LOGIN_EMAIL    = (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || '');
const LOGIN_PASSWORD = (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '');
const STAMP          = Date.now();
const OUT            = path.resolve(process.cwd(), 'reports/autologin-validation');
const VALID_URL      = 'https://example.com';
const uniqName       = (tag) => `AL_${tag}_${STAMP}`;

/** expect: REJECT = save must be blocked · ACCEPT = must save · OBSERVE = record only */
const CASES = [
  { id: 'AL-001', scenario: 'Widget Name blank',          expect: 'REJECT',  name: '',                      url: VALID_URL },
  { id: 'AL-002', scenario: 'URL blank',                  expect: 'REJECT',  name: uniqName('002'),         url: '' },
  { id: 'AL-003', scenario: 'Invalid URL (abcd)',         expect: 'REJECT',  name: uniqName('003'),         url: 'abcd' },
  { id: 'AL-004', scenario: 'URL without protocol',       expect: 'OBSERVE', name: uniqName('004'),         url: 'google.com' },
  { id: 'AL-005', scenario: 'HTTP URL',                   expect: 'OBSERVE', name: uniqName('005'),         url: 'http://test.com' },
  { id: 'AL-006', scenario: 'Unsupported protocol (ftp)', expect: 'REJECT',  name: uniqName('006'),         url: 'ftp://server.com' },
  { id: 'AL-007', scenario: 'Name only spaces',           expect: 'REJECT',  name: '   ',                   url: VALID_URL },
  { id: 'AL-008', scenario: 'Name with emoji',            expect: 'ACCEPT',  name: `AL008_🚀_${STAMP}`,      url: VALID_URL },
  { id: 'AL-009', scenario: 'Very long name (500 chars)', expect: 'OBSERVE', name: 'L' + 'x'.repeat(497) + `_${STAMP % 1000}`, url: VALID_URL },
  { id: 'AL-010', scenario: 'SQL injection in name',      expect: 'ACCEPT',  name: `' OR 1=1-- ${STAMP}`,    url: VALID_URL },
];

const results = [];
const created = [];

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
  await expect(page.getByRole('button', { name: /add new/i }).first()).toBeVisible({ timeout: 15_000 });
}

test('AL-001..010 Auto Login widget name/URL validation [hardened]', async ({ page }) => {
  test.setTimeout(360_000);
  fs.mkdirSync(OUT, { recursive: true });

  // Same-origin app errors ONLY — third-party iframe noise is discarded.
  const appErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location?.().url || '';
    if (loc.includes(APP_HOST) || loc === '') appErrors.push(m.text());
  });
  page.on('pageerror', (e) => appErrors.push(`PAGEERROR: ${e.message}`));

  await login(page);
  await gotoAutoLogin(page);

  for (const c of CASES) {
    // Full app reload before EACH case: the create form does not self-reset
    // (BUG-3), so isolating each case is the only way to get a clean verdict.
    await gotoAutoLogin(page);
    await page.waitForTimeout(1500);
    const errBefore = appErrors.length;
    let outcome = 'ERROR', detail = '', staleForm = false, rendered = null;
    try {
      await page.getByRole('button', { name: /add new/i }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const nameBox = dialog.getByRole('textbox').first();
      const urlBox  = dialog.getByPlaceholder(/example\.com/i);

      // BUG-3 probe: a freshly opened dialog should be blank.
      const preName = (await nameBox.inputValue().catch(() => '')) || '';
      const preUrl  = (await urlBox.count()) ? (await urlBox.inputValue().catch(() => '')) : '';
      staleForm = preName.trim() !== '' || preUrl.trim() !== '';

      await nameBox.fill('');
      if (c.name) await nameBox.fill(c.name);
      if (await urlBox.count()) { await urlBox.fill(''); if (c.url) await urlBox.fill(c.url); }

      await dialog.getByRole('button', { name: /^save$/i }).click();
      await page.waitForTimeout(2500);

      if (await dialog.isVisible().catch(() => false)) {
        const txt = (await dialog.innerText().catch(() => '')) || '';
        const m = txt.match(/(required|invalid|not valid|valid url|enter a|must |allowed|protocol|error)[^\n]{0,60}/i);
        detail = m ? m[0].trim() : 'dialog stayed open (save blocked, no message)';
        outcome = 'REJECTED';
        await dialog.getByRole('button', { name: /^cancel$/i }).click().catch(() => {});
        await page.waitForTimeout(400);
      } else {
        outcome = 'ACCEPTED';
        detail = 'dialog closed — widget created';
        if (c.name.trim()) created.push(c.name);
        // ACCEPT cases: confirm the name is actually visible in the list (render check).
        if (c.expect === 'ACCEPT') {
          rendered = await page.getByText(c.name, { exact: false }).first()
            .isVisible({ timeout: 4000 }).catch(() => false);
        }
      }
    } catch (e) {
      outcome = 'ERROR';
      detail = String(e).split('\n')[0].slice(0, 140);
      await page.keyboard.press('Escape').catch(() => {});
      await gotoAutoLogin(page).catch(() => {});
    }

    const appCrash = appErrors.length > errBefore;
    let verdict;
    if (c.expect === 'REJECT')      verdict = outcome === 'REJECTED' ? 'PASS' : 'FAIL';
    else if (c.expect === 'ACCEPT') verdict = (outcome === 'ACCEPTED' && rendered !== false) ? 'PASS' : 'FAIL';
    else                            verdict = outcome === 'ERROR' ? 'FAIL' : 'PASS'; // OBSERVE
    if (appCrash) verdict = verdict === 'PASS' ? 'PASS*' : verdict; // note-only, don't auto-fail

    const row = { ...c, outcome, verdict, detail, appCrash, staleForm, rendered };
    results.push(row);
    console.log(`RESULT ${c.id} [${verdict}] ${c.scenario} -> ${outcome}`
      + `${staleForm ? ' +STALE-FORM(BUG-3)' : ''}${appCrash ? ' +APP-ERR' : ''}`
      + `${rendered === false ? ' +NOT-RENDERED' : ''} :: ${detail}`);
  }

  fs.writeFileSync(path.join(OUT, 'results-hardened.json'), JSON.stringify(results, null, 2));
  console.log('\n===== SUMMARY (outcome-based) =====');
  for (const r of results)
    console.log(`${r.id}\t${r.verdict}\t${r.outcome}\t${r.staleForm ? 'STALE ' : ''}${r.scenario}`);
});

test.afterAll(async ({ browser }) => {
  const remaining = [];
  if (!created.length) { console.log('CLEANUP: nothing created'); return; }
  const page = await browser.newPage();
  try {
    await login(page);
    await gotoAutoLogin(page);
    for (const name of created) {
      try {
        const search = page.getByRole('textbox', { name: /^search/i }).last();
        if (await search.count()) { await search.fill(name); await page.waitForTimeout(1200); }
        page.on('dialog', (d) => d.accept().catch(() => {}));
        const row = page.locator('p', { hasText: name }).first().locator('xpath=..');
        if (await row.count()) {
          const btns = row.getByRole('button');
          if (await btns.count() >= 2) { await btns.nth(1).click(); await page.waitForTimeout(800); }
          const confirm = page.getByRole('button', { name: /^(yes|delete|confirm|ok)$/i });
          if (await confirm.first().isVisible().catch(() => false)) await confirm.first().click();
          await page.waitForTimeout(800);
        }
        if (await search.count()) { await search.fill(name); await page.waitForTimeout(1000); }
        const still = await page.locator('p', { hasText: name }).first().isVisible().catch(() => false);
        if (still) remaining.push(name);
        console.log(`CLEANUP: "${name.slice(0, 24)}" -> ${still ? 'STILL PRESENT' : 'deleted'}`);
      } catch (e) { remaining.push(name); console.log(`CLEANUP FAILED "${name.slice(0, 24)}": ${e}`); }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'cleanup-remaining.json'), JSON.stringify(remaining, null, 2));
    await page.close();
  }
});
