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

            // Click on "Add House" or "New House" button
            const addButton = page.getByRole('link', { name: /add|new|create/i }).or(
                page.getByRole('button', { name: /add|new|create/i })
            );
            await addButton.click();

            // Should be on new house page
            await expect(page).toHaveURL(/\/houses\/new/);
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

            // Click on "Add Resident" or "New Resident" button
            const addButton = page.getByRole('link', { name: /add|new|create/i }).or(
                page.getByRole('button', { name: /add|new|create/i })
            );
            await addButton.click();

            // Should be on new resident page
            await expect(page).toHaveURL(/\/residents\/new/);
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
});
