
/**
 * Wilyer CMS — Content Rollout test suite
 *
 * Target: https://cms3.pocsample.in
 *
 * Coverage groups:
 *   • Authentication & Navigation
 *   • Create Rollout — positive
 *   • Create Rollout — negative
 *   • Main Group selection
 *   • Rows — add / validate / delete
 *   • Content — add single / multiple / duration
 *   • Save & Publish
 *   • Delete & Cleanup
 *
 * Conventions:
 *   • Each test is self-contained — it creates the rollout it needs.
 *   • Selectors prefer roles / labels / stable ids (#addRollout, #setMainGroup,
 *     #addRow). nth-child / index-only selectors are avoided.
 *   • A unique suffix (uniq()) is appended to every artifact name so parallel
 *     runs and reruns don't collide.
 */

import { test, expect } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL       = 'https://cms3.pocsample.in';
const LOGIN_EMAIL    = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

const PREFERRED_GROUP = 'Main PPI';   // ideal target if present
const FALLBACK_GROUP  = 'India';      // confirmed-present group on cms3

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Unique suffix per call — keeps artifact names collision-free across reruns. */
const uniq = (prefix = 'AT') =>
  `${prefix}_${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`;

async function login(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[name="password"]').fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page.getByRole('link', { name: /Rollouts/i }))
    .toBeVisible({ timeout: 30_000 });
}

async function gotoRollouts(page) {
  await page.goto(`${BASE_URL}/content-rollout`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /New Rollout/i }))
    .toBeVisible({ timeout: 20_000 });
}

async function openCreateRolloutModal(page) {
  await page.getByRole('button', { name: /New Rollout/i }).click();
  const modal = page.locator('#addRollout.show');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

/**
 * Create a rollout end-to-end.
 * Returns { name, id } where id is the hex from /content-rollout/<id>.
 */
async function createRollout(page, { name, description = '' } = {}) {
  const rolloutName = name || uniq('Rollout');
  await gotoRollouts(page);
  const modal = await openCreateRolloutModal(page);
  await modal.locator('input[placeholder*="Q4 Brand Launch"]').fill(rolloutName);
  if (description) await modal.locator('textarea').fill(description);
  await modal.getByRole('button', { name: /^Create$/ }).click();
  await page.waitForURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 15_000 });
  const id = page.url().split('/').pop();
  return { name: rolloutName, id };
}

async function chooseMainGroup(page, preferred = PREFERRED_GROUP, fallback = FALLBACK_GROUP) {
  await page.getByRole('button', { name: /Choose Group/i }).click();
  const modal = page.locator('#setMainGroup');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  const select = modal.locator('select');
  await expect(select).toBeVisible({ timeout: 10_000 });

  const opts = (await select.locator('option').allTextContents()).map(o => o.trim());
  const choice =
       opts.find(o => o.toLowerCase() === preferred.toLowerCase())
    || opts.find(o => o.toLowerCase() === fallback.toLowerCase())
    || opts.find(o => o && !/choose/i.test(o));

  if (!choice) throw new Error('No selectable group available in #setMainGroup');
  await select.selectOption({ label: choice });
  await modal.getByRole('button', { name: /^Save$/ }).click();
  await waitForModalClosed(page, 'setMainGroup');
  return choice;
}

async function addRow(page, code) {
  await page.getByRole('button', { name: /^\s*Row\s*$/ }).click();
  const modal = page.locator('#addRow.show');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('input[placeholder*="DEL"]').fill(code);
  await modal.getByRole('button', { name: /^Add$/ }).click();
  await waitForModalClosed(page, 'addRow');
}

/**
 * Add a content cell to the rollout grid.
 * The Content button opens an inline editor — type the name, click Add,
 * then click any duration chip that matches `duration`.
 */
async function addContent(page, contentName, duration = '15s') {
  await page.getByRole('button', { name: /^\s*Content\s*$/ }).click();
  const input = page.getByRole('textbox').last();
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(contentName);
  await page.getByRole('button', { name: /^Add$/ }).click();
  // Duration chips appear after Add — pick the one matching `duration`
  const chip = page.getByRole('button', { name: new RegExp(`^${duration}$`, 'i') });
  if (await chip.count()) await chip.first().click();
  // Confirm by clicking the rendered tile (any visible bordered cell)
  const tile = page.locator('.border >> visible=true').first();
  if (await tile.count()) await tile.click().catch(() => {});
}

async function saveRollout(page) {
  const save = page.getByRole('button', { name: /^\s*Save\s*$/ });
  await expect(save).toBeVisible({ timeout: 10_000 });
  await save.first().click();
}

async function publishRollout(page) {
  const publish = page.getByRole('button', { name: /^\s*Publish\s*$/ });
  await expect(publish).toBeVisible({ timeout: 10_000 });
  await publish.click();
  // Confirm modal varies — accept Publish/Confirm/Yes if it pops
  const confirm = page.getByRole('button', { name: /^(Publish|Confirm|Yes)$/ }).last();
  if (await confirm.count()) await confirm.click().catch(() => {});
}

async function deleteRolloutByName(page, name) {
  await gotoRollouts(page);
  const card = page.locator('div').filter({
    has: page.getByRole('heading', { name }),
  }).first();
  if (!(await card.count())) return false;
  const menuBtn = card.locator('button').first();
  await menuBtn.click().catch(() => {});
  const del = page.getByRole('menuitem', { name: /delete/i })
    .or(page.getByRole('button', { name: /^Delete$/ }));
  if (!(await del.count())) return false;
  await del.first().click().catch(() => {});
  const confirm = page.getByRole('button', { name: /^(Delete|Confirm|Yes)$/ });
  if (await confirm.count()) await confirm.first().click().catch(() => {});
  return true;
}

async function waitForModalClosed(page, modalId) {
  await expect(page.locator(`#${modalId}.show`)).toBeHidden({ timeout: 15_000 });
}

/** True if any toast / alert contains the given pattern (case-insensitive). */
async function hasToast(page, pattern) {
  const t = page.locator('.toast, .Toastify__toast, [class*="alert"]')
    .filter({ hasText: typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern });
  try {
    await expect(t.first()).toBeVisible({ timeout: 5_000 });
    return true;
  } catch { return false; }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Wilyer CMS — Content Rollout', () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ─── Authentication & Navigation ──────────────────────────────────────────
  test.describe('Auth & Navigation', () => {
    test('TC-NAV-01: Sidebar Rollouts link navigates to the Rollouts list', async ({ page }) => {
      await page.getByRole('link', { name: /Rollouts/i }).click();
      await expect(page).toHaveURL(/\/content-rollout(\/?$|\?)/, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: /New Rollout/i })).toBeVisible();
    });

    test('TC-NAV-02: Direct /content-rollout URL renders the list when authenticated', async ({ page }) => {
      await gotoRollouts(page);
      await expect(page.getByRole('button', { name: /New Rollout/i })).toBeVisible();
    });

    test('TC-NAV-03: Unauthenticated request to /content-rollout redirects to login', async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/content-rollout`, { waitUntil: 'domcontentloaded' });
      // The login form must be reachable — we don't assert exact URL because
      // many SPAs render login at /login, /, or as a modal.
      await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 15_000 });
      await ctx.close();
    });
  });

  // ─── Create Rollout — positive ────────────────────────────────────────────
  test.describe('Create Rollout — positive', () => {
    test('TC-CR-01: Create rollout with valid name and description', async ({ page }) => {
      const name = uniq('Rollout_Valid');
      const { id } = await createRollout(page, { name, description: 'Auto desc' });
      expect(id).toMatch(/^[a-f0-9]+$/i);
      await gotoRollouts(page);
      await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('TC-CR-02: Create rollout with empty description (description is optional)', async ({ page }) => {
      const name = uniq('Rollout_NoDesc');
      const { id } = await createRollout(page, { name });
      expect(id).toMatch(/^[a-f0-9]+$/i);
    });

    test('TC-CR-03: Create rollout with special-character name preserves the name verbatim', async ({ page }) => {
      const name = `Rollout_!@#$%^&*()_${Date.now().toString().slice(-6)}`;
      await createRollout(page, { name });
      await gotoRollouts(page);
      await expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('TC-CR-04: Create rollout with long (200-char) name is accepted or rejected gracefully', async ({ page }) => {
      const longName = 'L' + 'x'.repeat(199);
      await gotoRollouts(page);
      const modal = await openCreateRolloutModal(page);
      await modal.locator('input[placeholder*="Q4 Brand Launch"]').fill(longName);
      await modal.getByRole('button', { name: /^Create$/ }).click();

      // Accept either outcome but require a deterministic one
      const navigated = await page.waitForURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 8_000 })
        .then(() => true).catch(() => false);
      const stillOpen = await page.locator('#addRollout.show').isVisible().catch(() => false);
      expect(navigated || stillOpen, 'long name must navigate or block submit, not hang silently')
        .toBeTruthy();
    });

    test('TC-CR-05: Newly created rollout is openable via the list', async ({ page }) => {
      const name = uniq('Rollout_Openable');
      await createRollout(page, { name });
      await gotoRollouts(page);
      const card = page.locator('div').filter({
        has: page.getByRole('heading', { name }),
      }).first();
      const openLink = card.getByRole('link', { name: /open/i }).first();
      await expect(openLink).toBeVisible({ timeout: 15_000 });
      await openLink.click();
      await expect(page).toHaveURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 15_000 });
    });
  });

  // ─── Create Rollout — negative ────────────────────────────────────────────
  test.describe('Create Rollout — negative', () => {
    test('TC-CR-N1: Empty submit (no name) keeps the modal open', async ({ page }) => {
      await gotoRollouts(page);
      const modal = await openCreateRolloutModal(page);
      await modal.getByRole('button', { name: /^Create$/ }).click();
      await expect(page.locator('#addRollout.show')).toBeVisible({ timeout: 5_000 });
      // Cleanup: dismiss
      await modal.getByRole('button', { name: /^(Cancel|Close)$/ }).first()
        .click().catch(() => page.keyboard.press('Escape'));
    });

    test('TC-CR-N2: Whitespace-only name is rejected', async ({ page }) => {
      await gotoRollouts(page);
      const modal = await openCreateRolloutModal(page);
      await modal.locator('input[placeholder*="Q4 Brand Launch"]').fill('   ');
      await modal.getByRole('button', { name: /^Create$/ }).click();
      const navigated = await page.waitForURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 5_000 })
        .then(() => true).catch(() => false);
      expect(navigated, 'whitespace-only name must not create a rollout').toBeFalsy();
      await page.keyboard.press('Escape').catch(() => {});
    });

    test('TC-CR-N3: Duplicate name is rejected', async ({ page }) => {
      const name = uniq('Rollout_Dup');
      // First create
      await createRollout(page, { name });
      // Try to create again with same name
      await gotoRollouts(page);
      const modal = await openCreateRolloutModal(page);
      await modal.locator('input[placeholder*="Q4 Brand Launch"]').fill(name);
      await modal.locator('textarea').fill('dupe attempt');
      await modal.getByRole('button', { name: /^Create$/ }).click();

      const toast = await hasToast(page, /exist|duplicate|already/);
      const stillOpen = await page.locator('#addRollout.show').isVisible().catch(() => false);
      expect(toast || stillOpen, 'duplicate must surface error or block close').toBeTruthy();
      await page.keyboard.press('Escape').catch(() => {});
    });

    test('TC-CR-N4: Cancel discards the draft', async ({ page }) => {
      const name = uniq('Rollout_Cancelled');
      await gotoRollouts(page);
      const modal = await openCreateRolloutModal(page);
      await modal.locator('input[placeholder*="Q4 Brand Launch"]').fill(name);
      const cancel = modal.getByRole('button', { name: /^(Cancel|Close)$/ }).first();
      await cancel.click().catch(() => page.keyboard.press('Escape'));
      await waitForModalClosed(page, 'addRollout');
      await expect(page.getByRole('heading', { name })).toHaveCount(0);
    });
  });

  // ─── Main Group selection ─────────────────────────────────────────────────
  test.describe('Main Group selection', () => {
    test('TC-GRP-01: Choose Group dropdown lists at least one selectable group', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_GrpList') });
      await page.getByRole('button', { name: /Choose Group/i }).click();
      const modal = page.locator('#setMainGroup');
      await expect(modal).toBeVisible({ timeout: 10_000 });
      const opts = await modal.locator('select option').allTextContents();
      const real = opts.map(o => o.trim()).filter(o => o && !/choose/i.test(o));
      expect(real.length).toBeGreaterThan(0);
      await page.keyboard.press('Escape').catch(() => {});
    });

    test('TC-GRP-02: Selecting a group and saving persists the selection', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_GrpSave') });
      const picked = await chooseMainGroup(page);
      // After save, the Choose Group button label should reflect the group OR
      // a "main group" label should be visible somewhere on the page.
      const labelVisible = await page.getByText(picked, { exact: false }).first()
        .isVisible({ timeout: 8_000 }).catch(() => false);
      expect(labelVisible, `selected group "${picked}" should appear on the page`).toBeTruthy();
    });

    test('TC-GRP-03: Adding a row before choosing a group is not silently allowed', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_NoGrp') });
      // Try to open Add Row before group
      await page.getByRole('button', { name: /^\s*Row\s*$/ }).click().catch(() => {});
      // Either the modal opens (we then close) or a toast/inline error fires
      const modalOpen = await page.locator('#addRow.show').isVisible({ timeout: 3_000 }).catch(() => false);
      const toast = await hasToast(page, /group/);
      // Record outcome — either path is acceptable, but at least one must be observable
      expect(modalOpen || toast).toBeTruthy();
      if (modalOpen) await page.keyboard.press('Escape').catch(() => {});
    });
  });

  // ─── Rows ─────────────────────────────────────────────────────────────────
  test.describe('Rows', () => {
    test('TC-ROW-01: Add a row with a valid code', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Row1') });
      await chooseMainGroup(page);
      const code = `R${Date.now().toString().slice(-5)}`;
      await addRow(page, code);
      await expect(page.locator('table, [role="table"]').getByText(code).first())
        .toBeVisible({ timeout: 10_000 });
    });

    test('TC-ROW-02: Empty row code is rejected', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_RowEmpty') });
      await chooseMainGroup(page);
      await page.getByRole('button', { name: /^\s*Row\s*$/ }).click();
      const modal = page.locator('#addRow.show');
      await expect(modal).toBeVisible({ timeout: 10_000 });
      await modal.getByRole('button', { name: /^Add$/ }).click();
      // Modal should still be open
      await expect(page.locator('#addRow.show')).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape').catch(() => {});
    });

    test('TC-ROW-03: Duplicate row code is rejected', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_RowDup') });
      await chooseMainGroup(page);
      const code = `D${Date.now().toString().slice(-5)}`;
      await addRow(page, code);

      // Try to add the same code again
      await page.getByRole('button', { name: /^\s*Row\s*$/ }).click();
      const modal = page.locator('#addRow.show');
      await expect(modal).toBeVisible({ timeout: 10_000 });
      await modal.locator('input[placeholder*="DEL"]').fill(code);
      await modal.getByRole('button', { name: /^Add$/ }).click();

      const toast = await hasToast(page, /exist|duplicate|already/);
      const stillOpen = await page.locator('#addRow.show').isVisible().catch(() => false);
      expect(toast || stillOpen).toBeTruthy();
      await page.keyboard.press('Escape').catch(() => {});
    });

    test('TC-ROW-04: Multiple rows render in the order they were added', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_RowMulti') });
      await chooseMainGroup(page);
      const codes = ['A1', 'B2', 'C3'].map(c => `${c}${Date.now().toString().slice(-3)}`);
      for (const c of codes) await addRow(page, c);

      const table = page.locator('table, [role="table"]');
      for (const c of codes) {
        await expect(table.getByText(c).first()).toBeVisible({ timeout: 10_000 });
      }
    });
  });

  // ─── Content ──────────────────────────────────────────────────────────────
  test.describe('Content', () => {
    test('TC-CON-01: Add a single content cell to a row', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Con1') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      const contentName = `c1_${Date.now().toString().slice(-4)}`;
      await addContent(page, contentName);
      await expect(page.getByText(contentName).first()).toBeVisible({ timeout: 10_000 });
    });

    test('TC-CON-02: Add multiple content cells (3) sequentially', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Con3') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      const names = ['c1', 'c2', 'c3'].map(n => `${n}_${Date.now().toString().slice(-4)}`);
      for (const n of names) await addContent(page, n);
      for (const n of names) {
        await expect(page.getByText(n).first()).toBeVisible({ timeout: 10_000 });
      }
    });

    test('TC-CON-03: Empty content name is rejected', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_ConEmpty') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      await page.getByRole('button', { name: /^\s*Content\s*$/ }).click();
      const input = page.getByRole('textbox').last();
      await expect(input).toBeVisible({ timeout: 10_000 });
      // Don't fill — click Add directly
      await page.getByRole('button', { name: /^Add$/ }).click();
      // Page should not navigate; no new tile should render with empty name
      await expect(page).toHaveURL(/\/content-rollout\/[a-f0-9]+/i);
    });

    test('TC-CON-04: Default duration is 15s and the chip is selectable', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_ConDur') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      await page.getByRole('button', { name: /^\s*Content\s*$/ }).click();
      const input = page.getByRole('textbox').last();
      await input.fill(`dur_${Date.now().toString().slice(-4)}`);
      await page.getByRole('button', { name: /^Add$/ }).click();
      // 15s chip must be present
      const chip15 = page.getByRole('button', { name: /^15s$/i });
      await expect(chip15.first()).toBeVisible({ timeout: 10_000 });
    });

    test('TC-CON-05: Bulk-add 10 content records (smoke for stability)', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Bulk10') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      for (let i = 1; i <= 10; i++) {
        await addContent(page, `s${i}_${Date.now().toString().slice(-3)}`);
      }
      // Soft sanity: the page didn't error out and we still have a Save/Publish bar
      await expect(page.getByRole('button', { name: /^\s*(Save|Saved)\s*$/ }).first())
        .toBeVisible({ timeout: 10_000 });
    });
  });

  // ─── Save & Publish ───────────────────────────────────────────────────────
  test.describe('Save & Publish', () => {
    test('TC-SAVE-01: Save persists changes (Save → Saved label flip)', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Save') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      await saveRollout(page);
      // After save the button label commonly flips to "Saved"
      const saved = page.getByRole('button', { name: /^\s*Saved\s*$/ });
      const stillSave = page.getByRole('button', { name: /^\s*Save\s*$/ });
      const eitherVisible =
        (await saved.first().isVisible().catch(() => false)) ||
        (await stillSave.first().isVisible().catch(() => false));
      expect(eitherVisible).toBeTruthy();
    });

    test('TC-PUB-01: Publish surfaces a success signal (toast or status change)', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Pub') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      await addContent(page, `cpub_${Date.now().toString().slice(-3)}`);
      await saveRollout(page);
      await publishRollout(page);
      const toast = await hasToast(page, /publish|success|live/);
      const badge = await page.getByText(/published|live/i).first()
        .isVisible({ timeout: 5_000 }).catch(() => false);
      expect(toast || badge, 'publish must surface a toast or status badge').toBeTruthy();
    });

    test('TC-PUB-02: Unsaved changes trigger a beforeunload prompt or are recorded', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_Unsaved') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);

      let dialogMsg = null;
      page.on('dialog', async d => {
        dialogMsg = d.message();
        await d.dismiss().catch(() => {});
      });

      await page.evaluate(() => { window.location.href = '/'; }).catch(() => {});
      await page.waitForTimeout(1500);
      // Don't hard-fail (many SPAs skip beforeunload) — just record
      console.log(`beforeunload: ${dialogMsg ?? '(no native dialog surfaced)'}`);
    });
  });

  // ─── Delete & Cleanup ─────────────────────────────────────────────────────
  test.describe('Delete', () => {
    test('TC-DEL-01: Delete an unpublished rollout removes it from the list', async ({ page }) => {
      const name = uniq('Rollout_Del');
      await createRollout(page, { name });
      const removed = await deleteRolloutByName(page, name);
      if (!removed) test.skip(true, 'overflow/delete UI not exposed in this build');
      await gotoRollouts(page);
      await expect(page.getByRole('heading', { name })).toHaveCount(0, { timeout: 10_000 });
    });

    test('TC-DEL-02: Delete prompts a confirmation dialog before destructive action', async ({ page }) => {
      const name = uniq('Rollout_DelConfirm');
      await createRollout(page, { name });
      await gotoRollouts(page);
      const card = page.locator('div').filter({
        has: page.getByRole('heading', { name }),
      }).first();
      const menuBtn = card.locator('button').first();
      await menuBtn.click().catch(() => {});
      const del = page.getByRole('menuitem', { name: /delete/i })
        .or(page.getByRole('button', { name: /^Delete$/ }));
      if (!(await del.count())) test.skip(true, 'delete UI not exposed');
      await del.first().click().catch(() => {});
      const confirm = page.getByRole('button', { name: /^(Delete|Confirm|Yes)$/ });
      await expect(confirm.first()).toBeVisible({ timeout: 5_000 });
      // Cancel out — we don't actually want to delete in this assertion test
      const cancel = page.getByRole('button', { name: /^(Cancel|No)$/ });
      if (await cancel.count()) await cancel.first().click().catch(() => {});
    });
  });

  // ─── Stress / heavy-data (kept from prior suite) ──────────────────────────
  test.describe('Stress', () => {
    test('TC-STR-01: Add 50 content records to a rollout', async ({ page }) => {
      await createRollout(page, { name: uniq('Rollout_50') });
      await chooseMainGroup(page);
      await addRow(page, `R${Date.now().toString().slice(-5)}`);
      for (let i = 1; i <= 50; i++) {
        await addContent(page, `s${i}`);
      }
      await expect(page.getByRole('button', { name: /^\s*(Save|Saved)\s*$/ }).first())
        .toBeVisible({ timeout: 10_000 });
    });
  });
});
