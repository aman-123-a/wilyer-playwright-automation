import { test, expect } from '@playwright/test';

// ─── Login Credentials ────────────────────────────────────────────────────────
const LOGIN_EMAIL = 'dev@wilyer.com';
const LOGIN_PASSWORD = 'testdev';

// ─── How many groups to create ────────────────────────────────────────────────
const GROUP_COUNT = 100;
const NAME_PREFIX = 'AutoGroup';
// Unique run id so repeated runs don't collide on names.
const RUN_ID = Date.now().toString(36);

// ─── Single Test: Login Once → Create 100 Groups ──────────────────────────────

test('Create 100 groups with single login', async ({ page }) => {
  test.setTimeout(900_000); // 15 min for 100 creations

  // 1. Build the list of group names to create
  const groupNames = Array.from(
    { length: GROUP_COUNT },
    (_, i) => `${NAME_PREFIX}-${RUN_ID}-${String(i + 1).padStart(3, '0')}`
  );
  console.log(`📋 Will create ${groupNames.length} groups (prefix "${NAME_PREFIX}-${RUN_ID}")`);

  // 2. Login ONCE
  console.log(`\n🔐 Logging in as: ${LOGIN_EMAIL}`);
  await page.goto('https://cms.pocsample.in/');
  await page.getByPlaceholder(/email/i).fill(LOGIN_EMAIL);
  await page.getByPlaceholder(/password/i).fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /Log In/i }).click();
  await page.waitForLoadState('networkidle');
  console.log(`✅ Login successful\n`);

  // 3. Loop through all names and create each group.
  //    Staging throttles rapid CRUD (429 storm), so we pace each create and
  //    retry the submit if the modal hangs on its loading spinner.
  let created = 0;
  const failures = [];

  for (const groupName of groupNames) {
    console.log(`🚀 [${created + 1}/${groupNames.length}] Creating group: "${groupName}"`);

    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        // Navigate to Groups page (fresh modal each attempt)
        await page.goto('https://cms.pocsample.in/groups?action=newGroup');
        await page.waitForLoadState('networkidle');

        // Ensure the New Group modal is open
        const dialog = page.getByRole('dialog');
        if (!(await dialog.isVisible().catch(() => false))) {
          await page.getByRole('button', { name: /New Group/i }).click();
        }

        // Fill group name
        const nameInput = dialog.getByRole('textbox').first();
        await nameInput.fill(groupName);

        // Submit
        await dialog.getByRole('button', { name: /Create Group/i }).click();

        // Success = modal closes (group persisted). Tolerate slow/throttled responses.
        await expect(dialog).toBeHidden({ timeout: 30_000 });
        ok = true;
      } catch (err) {
        console.log(`   ⚠️  attempt ${attempt} failed for "${groupName}" — backing off…`);
        await page.waitForTimeout(3_000 * attempt); // linear backoff on throttle
      }
    }

    if (ok) {
      created++;
      console.log(`✅ Group "${groupName}" created! (${created}/${groupNames.length})`);
    } else {
      failures.push(groupName);
      console.log(`❌ Gave up on "${groupName}" after 3 attempts`);
    }

    // Pace requests to stay under the rate limit
    await page.waitForTimeout(1_200);
  }

  console.log(`\n🎉 Created ${created}/${groupNames.length} groups.`);
  if (failures.length) {
    console.log(`⚠️  ${failures.length} failed: ${failures.join(', ')}`);
  }
  expect(created, `Expected all ${groupNames.length} groups to be created`).toBe(groupNames.length);
});
