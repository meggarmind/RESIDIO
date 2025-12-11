import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

test.describe('Phase 4: Enhancements', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test.describe('Reference Management', () => {
        test('TC4.1: Settings references page loads', async ({ page }) => {
            await page.goto('/settings/references');

            // Check page loaded (may redirect or show content)
            await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
        });

        test('TC4.2: Streets section is visible', async ({ page }) => {
            await page.goto('/settings/references');

            // Look for streets section or tab
            const streetsSection = page.getByRole('heading', { name: /streets/i }).or(
                page.getByRole('tab', { name: /streets/i })
            ).or(page.locator('text=Streets'));

            await expect(streetsSection.first()).toBeVisible({ timeout: 10000 });
        });

        test('TC4.3: House types section is visible', async ({ page }) => {
            await page.goto('/settings/references');

            // Look for house types section or tab
            const houseTypesSection = page.getByRole('heading', { name: /house types/i }).or(
                page.getByRole('tab', { name: /house types/i })
            ).or(page.locator('text=House Types'));

            await expect(houseTypesSection.first()).toBeVisible({ timeout: 10000 });
        });

        test('TC4.4: Add new street dialog can be opened', async ({ page }) => {
            await page.goto('/settings/references');

            // Find and click add street button
            const addStreetBtn = page.getByRole('button', { name: /add.*street/i }).or(
                page.getByRole('button', { name: /new.*street/i })
            );

            if (await addStreetBtn.count() > 0) {
                await addStreetBtn.first().click();

                // Check dialog/modal opens - use specific dialog role selector
                await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
            }
        });
    });

    test.describe('Billing Settings', () => {
        test('TC4.5: Billing settings page loads', async ({ page }) => {
            await page.goto('/settings/billing');

            // Check page loaded
            await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
        });

        test('TC4.6: Billing profiles are displayed', async ({ page }) => {
            await page.goto('/settings/billing');

            // Look for billing profiles table or list
            await expect(
                page.locator('table, [role="table"]').or(page.locator('text=billing profile'))
            ).toBeVisible({ timeout: 10000 });
        });

        test('TC4.7: Can open add billing profile dialog', async ({ page }) => {
            await page.goto('/settings/billing');

            // Find and click add button
            const addBtn = page.getByRole('button', { name: /add|new|create/i });

            if (await addBtn.count() > 0) {
                await addBtn.first().click();

                // Check dialog/modal opens
                await expect(page.locator('[role="dialog"], form')).toBeVisible({ timeout: 5000 });
            }
        });
    });

    test.describe('Settings Navigation', () => {
        test('TC4.8: Settings main page loads', async ({ page }) => {
            await page.goto('/settings');

            // Check page loaded
            await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
        });

        test('TC4.9: Settings navigation contains billing link', async ({ page }) => {
            await page.goto('/settings');

            // Look for billing link in settings
            await expect(
                page.getByRole('link', { name: /billing/i }).or(page.locator('a[href*="billing"]'))
            ).toBeVisible({ timeout: 10000 });
        });

        test('TC4.10: Settings navigation contains references link', async ({ page }) => {
            await page.goto('/settings');

            // Look for references link in settings
            await expect(
                page.getByRole('link', { name: /references/i }).or(page.locator('a[href*="references"]'))
            ).toBeVisible({ timeout: 10000 });
        });
    });
});
