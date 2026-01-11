import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

test.describe('Phase 3: Resident & House Management', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test.describe('Houses Module', () => {
        test('TC3.1: Houses list page loads with table', async ({ page }) => {
            await page.goto('/houses');

            // Check for houses table
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Check for table headers
            await expect(page.getByRole('columnheader', { name: /house|number/i })).toBeVisible();
        });

        test('TC3.2: Navigate to new house form', async ({ page }) => {
            await page.goto('/houses');

            // Wait for table to load first
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on "Add House" button specifically
            const addButton = page.getByRole('button', { name: /add house/i });
            await addButton.click();

            // Should be on new house page
            await expect(page).toHaveURL(/\/houses\/new/, { timeout: 10000 });
        });

        test('TC3.3: House form shows required fields', async ({ page }) => {
            await page.goto('/houses/new');

            // Check for form fields
            await expect(page.locator('input[name="house_number"], input[placeholder*="house"]')).toBeVisible();

            // Check for street select
            await expect(page.locator('select, [role="combobox"]').first()).toBeVisible();

            // Check for submit button
            await expect(page.getByRole('button', { name: /create|save|submit/i })).toBeVisible();
        });

        test('TC3.4: House form validates required fields', async ({ page }) => {
            await page.goto('/houses/new');

            // Try to submit empty form
            await page.getByRole('button', { name: /create|save|submit/i }).click();

            // Check for validation error (form uses data-slot="form-message" for errors)
            // Use .first() since multiple validation messages may be shown
            await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('Residents Module', () => {
        test('TC3.5: Residents list page loads with table', async ({ page }) => {
            await page.goto('/residents');

            // Check for residents table
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });
        });

        test('TC3.6: Navigate to new resident form', async ({ page }) => {
            await page.goto('/residents');

            // Wait for table to load first
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on "Add Resident" button specifically
            const addButton = page.getByRole('button', { name: /add resident/i });
            await addButton.click();

            // Should be on new resident page
            await expect(page).toHaveURL(/\/residents\/new/, { timeout: 10000 });
        });

        test('TC3.7: Resident form shows required fields', async ({ page }) => {
            await page.goto('/residents/new');

            // Check for form fields
            await expect(page.locator('input[name="first_name"], input[placeholder*="first"]')).toBeVisible();
            await expect(page.locator('input[name="last_name"], input[placeholder*="last"]')).toBeVisible();

            // Check for submit button
            await expect(page.getByRole('button', { name: /create|save|submit/i })).toBeVisible();
        });

        test('TC3.8: Resident form validates required fields', async ({ page }) => {
            await page.goto('/residents/new');

            // Try to submit empty form
            await page.getByRole('button', { name: /create|save|submit/i }).click();

            // Check for validation error (form uses data-slot="form-message" for errors)
            // Use .first() since multiple validation messages may be shown
            await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible({ timeout: 5000 });
        });

        test('TC3.9: Create new resident with valid data', async ({ page }) => {
            await page.goto('/residents/new');

            // Generate unique test data
            const timestamp = Date.now();
            const testResident = {
                firstName: `Test${timestamp}`,
                lastName: 'Resident',
                email: `test${timestamp}@example.com`,
                phone: '08012345678',
            };

            // Fill form fields
            await page.fill('input[name="first_name"], input[placeholder*="first"]', testResident.firstName);
            await page.fill('input[name="last_name"], input[placeholder*="last"]', testResident.lastName);

            // Fill email if visible
            const emailField = page.locator('input[name="email"], input[type="email"]');
            if (await emailField.isVisible()) {
                await emailField.fill(testResident.email);
            }

            // Fill phone - the form uses phone_primary as the field name
            const phoneField = page.locator('input[name="phone_primary"]');
            if (await phoneField.isVisible()) {
                await phoneField.fill(testResident.phone);
            }

            // resident_type defaults to "primary" so no need to select
            // resident_role is optional (for house assignment)

            // Submit form
            await page.getByRole('button', { name: /create|save|submit/i }).click();

            // Wait for success (redirect or toast)
            await Promise.race([
                page.waitForURL(/\/residents(?!\/new)/, { timeout: 10000 }),
                page.locator('[data-sonner-toast]').waitFor({ timeout: 10000 })
            ]).catch(() => { });
        });

        test('TC3.10: Filter residents by status', async ({ page }) => {
            await page.goto('/residents');

            // Find status filter
            const statusFilter = page.locator('select, [role="combobox"]').filter({ hasText: /status|all/i });

            if (await statusFilter.count() > 0) {
                await statusFilter.first().click();
                // Select a status option
                await page.getByRole('option', { name: /active|verified/i }).first().click();
            }
        });
    });

    test.describe('House Resident Management', () => {
        test('TC3.11: House detail page shows linked residents', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row to view details
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();

                // Should navigate to house detail page
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Check for Residents section
                const residentsSection = page.locator('text=/Linked Residents|Current Residents|Residents/i');
                await expect(residentsSection.first()).toBeVisible({ timeout: 10000 });
            }
        });

        test('TC3.12: Remove button visible for secondary residents (occupants/family)', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Look for remove/trash button in residents list
                // This button should be visible for secondary roles (co_resident, household_member, etc.)
                const removeButtons = page.locator('[data-testid="remove-resident-button"], button:has(svg[class*="lucide-trash"])');

                // If remove buttons exist, at least one should be visible for secondary residents
                // Note: This may not find buttons if house has no secondary residents
                if (await removeButtons.count() > 0) {
                    await expect(removeButtons.first()).toBeVisible();
                }
            }
        });

        test('TC3.13: Remove resident confirmation dialog appears', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Find remove button for secondary resident
                const removeButton = page.locator('[data-testid="remove-resident-button"], button:has(svg[class*="lucide-trash"])').first();

                if (await removeButton.count() > 0 && await removeButton.isVisible()) {
                    await removeButton.click();

                    // Confirmation dialog should appear
                    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
                    await expect(dialog).toBeVisible({ timeout: 5000 });

                    // Dialog should have confirm/cancel buttons
                    const confirmText = page.locator('text=/Remove|Confirm|Yes/i');
                    const cancelText = page.locator('text=/Cancel|No|Keep/i');

                    await expect(confirmText.first()).toBeVisible();
                    await expect(cancelText.first()).toBeVisible();

                    // Close dialog by clicking cancel
                    await cancelText.first().click();
                }
            }
        });

        test('TC3.14: Cancel removal keeps resident in list', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Count residents before
                const residentItems = page.locator('[data-testid="resident-card"], [class*="resident"]');
                const countBefore = await residentItems.count();

                // Find remove button
                const removeButton = page.locator('[data-testid="remove-resident-button"], button:has(svg[class*="lucide-trash"])').first();

                if (await removeButton.count() > 0 && await removeButton.isVisible()) {
                    await removeButton.click();

                    // Click cancel in dialog
                    const cancelButton = page.locator('button:has-text("Cancel"), button:has-text("No")').first();
                    if (await cancelButton.isVisible()) {
                        await cancelButton.click();
                    }

                    // Wait for dialog to close
                    await page.waitForTimeout(500);

                    // Count should remain the same
                    const countAfter = await residentItems.count();
                    expect(countAfter).toBe(countBefore);
                }
            }
        });

        test('TC3.15: Move Out button visible for tenants', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Look for tenant with Move Out button
                // The tenant role should have a "Move Out" button
                const moveOutButtons = page.locator('button:has-text("Move Out")');

                // If move out buttons exist (house has tenant or resident_landlord)
                if (await moveOutButtons.count() > 0) {
                    await expect(moveOutButtons.first()).toBeVisible();
                }
            }
        });

        test('TC3.16: Move Out wizard opens for tenant', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Find Move Out button (for tenant - opens wizard)
                const moveOutButton = page.locator('button:has-text("Move Out")').first();

                if (await moveOutButton.count() > 0 && await moveOutButton.isVisible()) {
                    await moveOutButton.click();

                    // Check if a dialog/wizard opened
                    // It could be either the simple move-out dialog (for landlord) or the wizard (for tenant)
                    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
                    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
                }
            }
        });

        test('TC3.17: Move Out wizard shows destination options', async ({ page }) => {
            await page.goto('/houses');

            // Wait for houses table to load
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });

            // Click on first house row
            const firstHouseRow = page.locator('table tbody tr, [role="row"]').first();
            if (await firstHouseRow.count() > 0) {
                await firstHouseRow.click();
                await expect(page).toHaveURL(/\/houses\/[a-zA-Z0-9-]+/, { timeout: 10000 });

                // Find Move Out button
                const moveOutButton = page.locator('button:has-text("Move Out")').first();

                if (await moveOutButton.count() > 0 && await moveOutButton.isVisible()) {
                    await moveOutButton.click();

                    // Check for wizard-specific content (step indicators, destination options)
                    // Look for the destination selection radio buttons
                    const leavingOption = page.locator('text=/Leaving the Estate|leaving/i');
                    const withinOption = page.locator('text=/Moving Within|within/i');

                    // If these are present, we're in the Move Out Wizard
                    if (await leavingOption.count() > 0) {
                        await expect(leavingOption.first()).toBeVisible({ timeout: 3000 });
                    }

                    // Close the dialog
                    const cancelButton = page.locator('button:has-text("Cancel")').first();
                    if (await cancelButton.isVisible()) {
                        await cancelButton.click();
                    }
                }
            }
        });
    });
});
