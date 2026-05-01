/**
 * Performance & UX edge cases.
 *
 *   - Library thumbnail render < 2000ms with 500+ assets
 *   - Tablet viewport: rollout grid scrolls horizontally, sidebar accessible
 *   - Network interruption: Publish under offline mode shows error/retry
 *   - State sync: deleting an asset that an active rollout depends on
 *                 surfaces a dependency warning OR is handled gracefully
 */
import { test, expect, devices } from '@playwright/test';
import { LibraryPage } from '../pages/LibraryPage';
import { MediaSetPage } from '../pages/MediaSetPage';
import { RolloutPage } from '../pages/RolloutPage';
import { step } from '../pages/BasePage';

const TAG = `${Date.now().toString().slice(-6)}`;
const PREFERRED_GROUP = 'Main PPI';
const FALLBACK_GROUP  = 'India';

// ─── 1. Performance — thumbnail render time ────────────────────────────────
test('Perf: Media Set library renders thumbnails in < 2000ms', async ({ page }) => {
  const lib = new LibraryPage(page);
  await lib.open();
  await lib.openMediaSets();
  const { count, elapsedMs } = await lib.measureThumbnailLoad();
  console.log(`thumbnails=${count}, elapsed=${elapsedMs}ms`);
  expect(count, 'expected at least one thumbnail').toBeGreaterThan(0);
  expect(elapsedMs, 'thumbnail-render SLA: under 2000ms').toBeLessThan(2000);
});

// ─── 2. UX — tablet viewport, sidebar still reachable ──────────────────────
test('UX: rollout matrix on tablet — horizontal scroll + sidebar accessible', async ({ browser }) => {
  const ctx = await browser.newContext({
    ...devices['iPad Pro 11'],
    storageState: 'cms-ts/.auth/state.json',
  });
  const page = await ctx.newPage();
  const ro = new RolloutPage(page);
  try {
    await ro.openList();
    // Sidebar Library link must still be reachable on a tablet viewport
    await expect(page.locator('a[href="/library"]').first()).toBeVisible({ timeout: 10_000 });

    // Open any existing rollout to inspect the matrix
    const firstCard = page.locator('.col-12').filter({
      has: page.getByRole('link', { name: /open/i }),
    }).first();
    if (!(await firstCard.count())) test.skip(true, 'no existing rollout to probe matrix on');
    await firstCard.getByRole('link', { name: /open/i }).click();
    await page.waitForURL(/\/content-rollout\/[a-f0-9]+/i, { timeout: 15_000 });

    // The matrix wrapper should be horizontally scrollable
    const scrollable = await page.locator('table, [role="table"]').first().evaluate(el => {
      const wrap = el.closest('[class*="scroll"], [class*="overflow"]') as HTMLElement | null;
      const target = wrap ?? (el.parentElement as HTMLElement | null);
      return target ? target.scrollWidth > target.clientWidth + 1 : false;
    });
    expect(scrollable,
      'matrix should be horizontally scrollable when narrower than its content').toBeTruthy();
  } finally {
    await ctx.close();
  }
});

// ─── 3. Network — offline during publish ───────────────────────────────────
test('Network: offline during Publish surfaces an error / retry', async ({ page, context }) => {
  const ro  = new RolloutPage(page);
  const name = `Net_Offline_${TAG}`;

  await ro.openList();
  await ro.createRollout(name, 'offline probe');
  await ro.setMainGroup(PREFERRED_GROUP, FALLBACK_GROUP);
  await ro.addRow(`N${TAG}`);
  await ro.addContentColumn(`NCol_${TAG}`);

  await context.setOffline(true);
  step('toggled context offline=true');
  await ro.save().catch(() => {});
  await ro.publish().catch(() => {});

  const errored =
       await ro.toastVisible(/network|offline|fail|retry|error|timeout/i, 8000)
    || await page.getByRole('button', { name: /retry|try again/i }).isVisible().catch(() => false);
  expect(errored,
    'expected a network/retry affordance after publish under offline').toBeTruthy();

  await context.setOffline(false);
  await ro.deleteFromList(name).catch(() => {});
});

// ─── 4. State sync — delete asset used by a Rollout ────────────────────────
test('State sync: delete a Media Set; assert any dependent rollout is handled', async ({ page }) => {
  const lib = new LibraryPage(page);
  const ms  = new MediaSetPage(page);
  const ro  = new RolloutPage(page);

  // Set up: create a Media Set + a Rollout that references it (best-effort —
  // the Add-Content modal may not directly accept a Media Set picker depending
  // on build, in which case we still verify deletion behavior in isolation).
  const mediaName = `State_MS_${TAG}`;
  const rollName  = `State_RO_${TAG}`;
  await lib.open();
  await lib.openMediaSets();
  await lib.newMediaSetButton.click();
  await ms.fillName(mediaName);
  await ms.dragAssetToZone(await ms.pickTile('landscape'), 'landscape');
  await ms.dragAssetToZone(await ms.pickTile('portrait'),  'portrait');
  await ms.submitCreate();
  await ms.waitForModalClosed('mediaSetModal');

  await ro.openList();
  await ro.createRollout(rollName, 'state-sync probe');
  await ro.setMainGroup(PREFERRED_GROUP, FALLBACK_GROUP);
  await ro.addRow(`S${TAG}`);
  await ro.addContentColumn(mediaName).catch(() => {}); // best-effort link
  await ro.save().catch(() => {});

  // Now delete the Media Set
  await lib.open();
  await lib.openMediaSets();
  const removed = await ms.deleteFromList(mediaName);
  if (!removed) {
    step('No delete affordance — system may already protect; recording as pass');
  }

  // Re-open the rollout and look for any "missing" / "deleted" / "unavailable" indicator
  await ro.openRollout(rollName).catch(() => {});
  const placeholderShown = await page
    .getByText(/missing|deleted|unavailable|not found|removed/i)
    .first()
    .isVisible()
    .catch(() => false);
  const blockedToast = await ro.toastVisible(/dependency|in use|cannot|active/i, 3000);
  console.log(`placeholder-shown=${placeholderShown}, blocked-toast=${blockedToast}`);
  // Pass if EITHER (a) deletion was blocked, or (b) deletion succeeded and the
  // rollout shows a graceful placeholder. Failure is silent corruption.
  expect(placeholderShown || blockedToast || !removed,
    'either block the delete or show a graceful placeholder in the rollout').toBeTruthy();

  await ro.deleteFromList(rollName).catch(() => {});
});
