import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// =============================================================================
//  Auto Login Widget — Widget Name / URL validation (AL-001 .. AL-010)
//  Drives the real create dialog at Library → Widgets → Auto Login → Add New.
//  Fields: Widget Name * (required), WebPage URL (placeholder https://example.com/).
//  Outcome detection:
//    • dialog stays open after Save (optionally with an inline message) => REJECTED
//    • dialog closes + name appears in list                            => ACCEPTED
//  Anything ACCEPTED is recorded and best-effort deleted in afterAll.
// =============================================================================

const BASE_URL       = 'https://cms3.pocsample.in/';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';
const STAMP          = Date.now();
const OUT            = path.resolve(process.cwd(), 'reports/autologin-validation');

// name-focused cases use a valid URL; url-focused cases use a valid unique name
const VALID_URL  = 'https://docs.google.com/spreadsheets/d/1FyGemEABydKj_KmnMEvA6OyqKUTCxAbkSdizGc5AiJY/edit?usp=sharing';
const uniqName   = (tag) => `AL_${tag}_${STAMP}`;

/** @type {{id:string, scenario:string, type:string, expect:'REJECT'|'ACCEPT'|'OBSERVE', name:string, url:string}[]} */
const CASES = [
  { id: 'AL-001', scenario: 'Widget Name blank',              type: 'Negative', expect: 'REJECT', name: '',                 url: VALID_URL },
  { id: 'AL-002', scenario: 'URL blank',                      type: 'Negative', expect: 'OBSERVE', name: uniqName('002'),    url: '' },
  { id: 'AL-003', scenario: 'Invalid URL (abcd)',             type: 'Negative', expect: 'REJECT', name: uniqName('003'),    url: 'abcd' },
  { id: 'AL-004', scenario: 'URL without protocol',           type: 'Edge',     expect: 'OBSERVE', name: uniqName('004'),    url: 'google.com' },
  { id: 'AL-005', scenario: 'HTTP URL',                       type: 'Edge',     expect: 'OBSERVE', name: uniqName('005'),    url: 'http://test.com' },
  { id: 'AL-006', scenario: 'Unsupported protocol (ftp)',     type: 'Negative', expect: 'OBSERVE', name: uniqName('006'),    url: 'ftp://server.com' },
  { id: 'AL-007', scenario: 'Name only spaces',              type: 'Negative', expect: 'REJECT', name: '   ',              url: VALID_URL },
  { id: 'AL-008', scenario: 'Name with emoji',               type: 'Edge',     expect: 'ACCEPT', name: `AL008_🚀_${STAMP}`, url: VALID_URL },
  { id: 'AL-009', scenario: 'Very long name (500 chars)',    type: 'Edge',     expect: 'OBSERVE', name: 'L' + 'x'.repeat(498) + `_${STAMP % 1000}`, url: VALID_URL },
  { id: 'AL-010', scenario: 'SQL injection in name',         type: 'Security', expect: 'ACCEPT', name: `' OR 1=1-- ${STAMP}`, url: VALID_URL },
];

const results = [];
const created = []; // names that actually got created -> cleanup

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

test('AL-001..010 Auto Login widget name/URL validation', async ({ page }) => {
  test.setTimeout(300_000);
  fs.mkdirSync(OUT, { recursive: true });

  const errors = [];
  page.on('console', (m) => { 
    if (m.type() === 'error') {
      console.error(`[BROWSER CONSOLE ERROR] ${m.text()}`);
      errors.push(m.text());
    }
  });
  page.on('pageerror', (e) => {
    console.error(`[BROWSER PAGE ERROR] ${e.message}`);
    errors.push(`PAGEERROR: ${e.message}`);
  });

  await login(page);
  await gotoAutoLogin(page);

  for (const c of CASES) {
    console.log(`Pacing 5 seconds before case ${c.id}: ${c.scenario}...`);
    await page.waitForTimeout(5000);
    const errBefore = errors.length;
    let outcome = 'ERROR';
    let detail = '';
    try {
      // Fresh dialog
      await page.getByRole('button', { name: /add new/i }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const nameBox = dialog.getByRole('textbox').first();
      await nameBox.fill('');
      if (c.name) await nameBox.fill(c.name);

      const urlBox = dialog.getByPlaceholder(/example\.com/i);
      if (await urlBox.count()) {
        await urlBox.fill('');
        if (c.url) await urlBox.fill(c.url);
      }

      await dialog.getByRole('button', { name: /^save$/i }).click();
      await page.waitForTimeout(2500);

      const stillOpen = await dialog.isVisible().catch(() => false);
      if (stillOpen) {
        // rejected — try to capture an inline message
        const txt = (await dialog.innerText().catch(() => '')) || '';
        const m = txt.match(/(required|invalid|not valid|valid url|enter a|must |allowed|error)[^\n]{0,60}/i);
        detail = m ? m[0].trim() : 'dialog stayed open (save blocked)';
        outcome = 'REJECTED';
        await dialog.getByRole('button', { name: /^cancel$/i }).click().catch(() => {});
        await page.waitForTimeout(500);
      } else {
        outcome = 'ACCEPTED';
        detail = 'dialog closed — widget created';
        if (c.name.trim()) created.push(c.name);
      }
    } catch (e) {
      outcome = 'ERROR';
      detail = String(e).split('\n')[0].slice(0, 120);
      // try to recover the UI for the next case
      await page.keyboard.press('Escape').catch(() => {});
      await gotoAutoLogin(page).catch(() => {});
    }

    const crashed = errors.length > errBefore;
    // verdict: does actual outcome match expectation?
    let verdict;
    if (c.expect === 'REJECT') verdict = outcome === 'REJECTED' ? 'PASS' : 'FAIL';
    else if (c.expect === 'ACCEPT') verdict = outcome === 'ACCEPTED' && !crashed ? 'PASS' : 'FAIL';
    else verdict = outcome === 'ERROR' ? 'FAIL' : 'PASS'; // OBSERVE: pass if handled without our-side error
    if (crashed) verdict = 'FAIL';

    const row = { ...c, outcome, verdict, detail, crashed };
    results.push(row);
    console.log(`RESULT ${c.id} [${verdict}] ${c.scenario} -> ${outcome}${crashed ? ' +JS-ERROR' : ''} :: ${detail}`);
  }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\n===== SUMMARY =====');
  for (const r of results) console.log(`${r.id}\t${r.verdict}\t${r.outcome}\t${r.scenario}`);
});

test.afterAll(async ({ browser }) => {
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
          console.log(`CLEANUP: attempted delete of "${name.slice(0, 30)}"`);
        }
      } catch (e) { console.log(`CLEANUP FAILED for "${name.slice(0, 30)}": ${e}`); }
    }
  } finally { await page.close(); }
});
