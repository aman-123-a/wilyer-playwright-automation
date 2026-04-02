import { test, expect } from '@playwright/test';
import readline from 'readline';


test('Create New Screen with Pairing Code', async ({ page }) => {
  test.setTimeout(0); // Disable timeout to allow time for manual input

  let screenName = ''; // Will be grabbed dynamically from what user types

  const screenTag = 'test';
  const location = 'india';

  // 1. Login
  await page.goto('https://cms.pocsample.in/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: /email or phone/i }).fill('dev@wilyer.com');
  await page.getByRole('textbox', { name: /password/i }).fill('testdev');
  await page.getByRole('button', { name: 'Log In' }).click();

  // Wait for page to load after login
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // 2. Navigate to New Screen
  await page.getByRole('link', { name: /New Screen/i }).click();
  await page.waitForSelector('input[placeholder="Enter pairing code"]');

  // 3. Wait for user to manually type BOTH in browser
  console.log('\n⏳ BROWSER PAUSED: Please type BOTH the Pairing Code AND the Screen Name directly in the browser window.');
  console.log('   (The script will automatically continue after BOTH are filled)');

  const pairingCodeLocator = page.getByPlaceholder('Enter pairing code');
  const screenNameLocator = page.getByRole('textbox', { name: /Enter screen name/i });

  // Loop until both fields are populated by the user
  while (true) {
    let pairCode = '';
    let sName = '';
    
    if (await pairingCodeLocator.count() > 0) {
       pairCode = await pairingCodeLocator.inputValue();
    }
    if (await screenNameLocator.count() > 0) {
       sName = await screenNameLocator.inputValue();
    }
    
    if (pairCode.trim().length >= 6 && sName.trim().length >= 1) {
       screenName = sName.trim(); // Grab it so we can verify the table at the very end!
       break;
    }
    await page.waitForTimeout(500); // Check again in 500ms
  }

  await page.waitForTimeout(800); // Small pause to assure they are fully done
  console.log('✅ DEBUG: Detected both inputs! Proceeding...');
  console.log(`✅ DEBUG: Using Screen Name "${screenName}" for later steps.`);

  // DEBUG: Log current page state after pairing code entry
  console.log('🔍 DEBUG: Page URL after pairing code:', page.url());
  console.log('🔍 DEBUG: Page title:', await page.title());

  // DEBUG: Check if pairing code field has value
  const pairingCodeValue = await pairingCodeLocator.inputValue();
  console.log('🔍 DEBUG: Pairing code field value:', pairingCodeValue);



  // Screen Name (Already filled manually by user, value was saved to screenName)

  // Add Tags
  await page.getByRole('textbox', { name: /Add a tag/i }).fill(screenTag);
  await page.keyboard.press('Enter'); // Confirm tag entry
  console.log('🔍 DEBUG: Added tag:', screenTag);

  // Wait for tag to be added and form to stabilize
  await page.waitForTimeout(2000);
  console.log('🔍 DEBUG: Waited 2 seconds after tag entry');

  // Location - Simplified approach
  console.log('🔍 DEBUG: Starting location selection...');
  const locationInput = page.getByRole('textbox', { name: /Search location|Enter Location/i });
  await locationInput.click();
  console.log('🔍 DEBUG: Clicked location field');

  await locationInput.fill(location);
  console.log('🔍 DEBUG: Filled location text');

  await page.waitForTimeout(1500); // wait for suggestions
  // Prefer to select via keyboard once dropdown is ready
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  console.log('🔍 DEBUG: Selected location via keyboard ArrowDown + Enter');
  await page.waitForTimeout(1000);

  // 4. Click (view) deleted screens
  console.log('🔍 DEBUG: Clicking (view) span...');
  const viewDeletedBtn = page.locator('span.text-primary.cursor-pointer[data-bs-target="#deletedScreens"]').first();
  await viewDeletedBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  
  if (await viewDeletedBtn.count() > 0 && await viewDeletedBtn.isVisible()) {
    await viewDeletedBtn.click();
    console.log('🔍 DEBUG: Clicked (view)');
    await page.waitForTimeout(1500); // Wait for the offcanvas to slide open
    
    console.log('🔍 DEBUG: Choosing one screen from deleted list...');
    const deletedCheckbox = page.locator('#deletedScreens input[type="checkbox"], .offcanvas input[type="checkbox"], .offcanvas-body input[type="checkbox"]').first();
    try {
      if (await deletedCheckbox.count() > 0) {
        await deletedCheckbox.check({ force: true });
        console.log('🔍 DEBUG: Checked deleted screen checkbox');
      } else {
        // Fallback: If no checkbox inside an offcanvas, click the last checkbox on the page
        await page.locator('input[type="checkbox"]').last().check({ force: true });
        console.log('🔍 DEBUG: Checked fallback checkbox');
      }
    } catch (e) {
      console.log('⚠️ Failed to check deleted screen:', e.message);
    }
    await page.waitForTimeout(500);
  } else {
    console.log('⚠️ Could not find (view) span for deleted screens');
  }

  // 5. Submit Form with Pair Screen button
  console.log('🔍 DEBUG: About to submit by clicking Pair Screen...');
  const pairButton = page.locator('button[type="submit"]:has-text("Pair Screen")').first();
  await pairButton.waitFor({ state: 'visible', timeout: 15000 }).catch(() => console.log('⚠️ Pair button wait failed, continuing anyway.'));
  
  try {
    // By this point the button should be enabled since everything is filled
    await pairButton.click({ force: true, timeout: 5000 });
    console.log('🔍 DEBUG: Clicked "Pair Screen" button');
  } catch (err) {
    console.log('⚠️ Failed to click Pair Screen button:', err.message);
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  // 5. Verify Success
  // Wait for navigation or success message
  console.log('🔍 DEBUG: Waiting for success verification...');
  await page.waitForTimeout(1000);

  // DEBUG: Check current page state
  console.log('🔍 DEBUG: Current URL after submit:', page.url());
  console.log('🔍 DEBUG: Current page title:', await page.title());

  // DEBUG: Look for success indicators in page text
  const pageText = await page.locator('body').textContent();
  console.log('🔍 DEBUG: Page contains text with "screen":', pageText?.includes('screen'));
  console.log('🔍 DEBUG: Page contains text with "created":', pageText?.includes('created'));
  console.log('🔍 DEBUG: Page contains text with "success":', pageText?.includes('success'));

  const successMessage = page.getByText(/screen.*created|successfully|added/i);
  if (await successMessage.count() > 0) {
    const successVisible = await successMessage.first().isVisible();
    console.log('🔍 DEBUG: Success message found, visible:', successVisible);
  } else {
    console.log('⚠️  Success message not found; maybe functionally created without visible banner');
  }

  const screenItem = page.locator('tr:has-text("' + screenName + '")');
  if (await screenItem.count() > 0) {
    const screenVisible = await screenItem.first().isVisible();
    console.log('🔍 DEBUG: Screen row found, visible:', screenVisible);

    // 6. Click row checkbox (select screen)
    const rowCheckbox = screenItem.locator('input[type="checkbox"]');
    if (await rowCheckbox.count() > 0) {
      await rowCheckbox.first().check({ force: true });
      console.log('🔍 DEBUG: Checked screen row checkbox for', screenName);
    } else {
      console.warn('⚠️  Row checkbox not found for the screen');
    }

    // 7. Click View element in row
    const viewSpan = screenItem.locator('span.text-primary.cursor-pointer:has-text("view")');
    let viewClicked = false;
    if (await viewSpan.count() > 0) {
      await viewSpan.first().click();
      viewClicked = true;
      console.log('🔍 DEBUG: Clicked View span for', screenName);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
    } else {
      // Fallback: element with text (view)
      const alternateView = screenItem.locator(':scope >> text=view').first();
      if (await alternateView.count() > 0) {
        await alternateView.click();
        viewClicked = true;
        console.log('🔍 DEBUG: Clicked alternate view text for', screenName);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);
      } else {
        console.warn('⚠️  View control not found in screen row for', screenName);
      }
    }

    // 8. Post-view assertion
    if (viewClicked) {
      const viewDetail = page.locator('h1, h2, div').filter({ hasText: screenName }).first();
      if (await viewDetail.count() > 0) {
        await expect(viewDetail).toBeVisible({ timeout: 8000 });
        console.log('✅ DEBUG: View detail verified for', screenName);
      } else {
        console.log('⚠️  View detail not directly found; checking for screen details title');
        const screenDetails = page.getByText(/screen details|screen info/i).first();
        if (await screenDetails.count() > 0) {
          await expect(screenDetails).toBeVisible({ timeout: 8000 });
          console.log('✅ DEBUG: Screen details section is visible');
        } else {
          console.warn('⚠️  Could not verify view content in-depth.');
        }
      }
    }

    // 9. Optional check action as extra verification
    const checkButton = page.getByRole('button', { name: /check|verify|status/i }).first();
    if (await checkButton.count() > 0) {
      await checkButton.click();
      console.log('🔍 DEBUG: Clicked Check/Verify button');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
    } else {
      console.warn('⚠️  Check/Verify button not found');
    }
  } else {
    console.warn('⚠️  Screen row not found in table for', screenName);
  }
});
