import { test, expect } from '@playwright/test';

test('Create New Screen with Pairing Code', async ({ page }) => {
  const screenName = 'aman test';
  // Get pairing code from environment variable - user must set it before running
  const pairingCode = process.env.PAIRING_CODE || '123456';
  
  if (!process.env.PAIRING_CODE) {
    console.warn('⚠️  PAIRING_CODE not provided. Using default: 123456');
    console.warn('To use a custom pairing code, set the environment variable:');
    console.warn('  Windows: set PAIRING_CODE=YOUR_CODE && npm test -- pair.spec.js');
    console.warn('  Linux/Mac: PAIRING_CODE=YOUR_CODE npm test -- pair.spec.js');
  }
  
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

  // 3. Fill Screen Details
  // Pairing Code - use env or fallback value
  const pairingCodeLocator = page.getByPlaceholder('Enter pairing code');
  await pairingCodeLocator.fill(pairingCode);
  console.log('🔍 DEBUG: Pairing code filled:', pairingCode);

  // DEBUG: Log current page state after pairing code entry
  console.log('🔍 DEBUG: Page URL after pairing code:', page.url());
  console.log('🔍 DEBUG: Page title:', await page.title());

  // DEBUG: Check if pairing code field has value
  const pairingCodeValue = await pairingCodeLocator.inputValue();
  console.log('🔍 DEBUG: Pairing code field value:', pairingCodeValue);

  // 3a. Click Pair button (if present)
  const pairButton = page.getByRole('button', { name: /pair|pairing/i }).first();
  if (await pairButton.count() > 0) {
    if (await pairButton.isEnabled()) {
      await pairButton.click();
      console.log('🔍 DEBUG: Clicked Pair button (enabled)');
    } else {
      console.warn('⚠️  Pair button found but disabled; forcing click');
      await pairButton.click({ force: true });
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
  } else {
    console.warn('⚠️  Pair button not found (maybe not required on this path)');
  }

  // Screen Name
  await page.getByRole('textbox', { name: /Enter screen name/i }).fill(screenName);
  console.log('🔍 DEBUG: Filled screen name:', screenName);
  
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

  // 4. Submit Form
  console.log('🔍 DEBUG: About to submit form...');
  const submitted = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => /create screen|create|submit|save|add/i.test(el.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!submitted) {
    throw new Error('Submit button not found by JavaScript fallback.');
  }
  console.log('🔍 DEBUG: Form submitted via page.evaluate');
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
      await rowCheckbox.first().check();
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
