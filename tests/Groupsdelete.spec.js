import { test, expect } from '@playwright/test';

test.describe('Group Deletion Flow', () => {

    test('delete up to 100 groups safely', async ({ page }) => {
        // Increase timeout to 20 minutes for up to 100 deletions
        test.setTimeout(1200000); 

        // 🔹 Step 1: Open Application
        console.log('🔗 Navigating to CMS...');
        await page.goto('https://cms.pocsample.in/', { waitUntil: 'networkidle' });

        // 🔹 Step 2: Login
        console.log('🔐 Logging in...');
        await page.getByPlaceholder(/email/i).fill('dev@wilyer.com');
        await page.getByPlaceholder(/password/i).fill('testdev');
        await page.getByRole('button', { name: /Log In/i }).click();

        // 🔹 Step 3: Wait for Dashboard and Navigate to Groups
        console.log('📂 Navigating to Groups...');
        await page.getByRole('link', { name: /Groups/i }).waitFor({ state: 'visible', timeout: 30000 });
        await page.getByRole('link', { name: /Groups/i }).click();

        // 🔹 Step 4: Wait for Table Load
        const rows = page.locator('table tbody tr');
        await expect(rows.first()).toBeVisible({ timeout: 15000 });

        // 🔹 Step 5: Loop to Delete Records (Max 100)
        console.log('🚀 Starting deletion loop...');
        for (let i = 0; i < 100; i++) {
            const rowCount = await rows.count();

            // Stop if no rows left
            if (rowCount === 0) {
                console.log('✅ No more records to delete');
                break;
            }

            console.log(`🗑️ Deleting record ${i + 1}/${rowCount}`);

            try {
                const firstRow = rows.first();
                
                // Identify delete button in the first row. 
                // Often it's the last button or has a 'trash' icon or the word 'Delete'.
                const deleteBtn = firstRow.getByRole('button').filter({ hasText: /Delete/i }).first()
                                .or(firstRow.getByRole('button').last());
                
                await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
                await deleteBtn.click();

                // 🔹 Wait for Confirmation Popup & Click Delete/Continue
                // We target buttons within any modal that might appear.
                const confirmBtn = page.locator('.modal-content, .modal-dialog, [role="dialog"]')
                                       .getByRole('button', { name: /Delete|Continue|Confirm/i })
                                       .first();
                
                await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
                await confirmBtn.click();

                // 🔹 Wait for modal and row to be hidden
                await expect(confirmBtn).toBeHidden({ timeout: 10000 });
                console.log(`✅ Record ${i + 1} deleted.`);
                
                // Wait a bit for the table to refresh/re-render
                await page.waitForTimeout(1000);

            } catch (error) {
                console.log(`⚠️ Encountered error deleting item #${i + 1}: ${error.message}`);
                console.log('🔄 Reloading page to reset state...');
                await page.reload();
                await page.waitForLoadState('networkidle');
                await page.getByRole('link', { name: /Groups/i }).click();
                await page.waitForTimeout(2000);
            }
        }

        console.log('🎉 Deletion process completed');
    });

});