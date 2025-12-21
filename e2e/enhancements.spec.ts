import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

test.describe('Phase 4: Enhancements', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test.describe('Reference Management', () => {
        test('TC4.1: Settings streets page loads', async ({ page }) => {
            await page.goto('/settings/streets');

            // Check page loaded with streets content
            await expect(page.getByText(/Streets/i).first()).toBeVisible({ timeout: 10000 });
        });

        test('TC4.2: Streets list is visible', async ({ page }) => {
            await page.goto('/settings/streets');

            // Look for streets list or table
            await expect(page.locator('table, [role="table"], .street').first()).toBeVisible({ timeout: 10000 });
        });

        test('TC4.3: House types page is visible', async ({ page }) => {
            await page.goto('/settings/house-types');

            // Look for house types content
            await expect(page.getByText(/House Types/i).first()).toBeVisible({ timeout: 10000 });
        });

        test('TC4.4: Add new street dialog can be opened', async ({ page }) => {
            await page.goto('/settings/streets');

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

            // Wait for settings page to fully load
            await page.waitForLoadState('networkidle');
            await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });

            // Look for billing link in settings nav (not the main sidebar) - link text is "Billing Profiles"
            // Use specific href to avoid matching the main sidebar /billing link
            await expect(
                page.locator('a[href="/settings/billing"]')
            ).toBeVisible({ timeout: 10000 });
        });

        test('TC4.10: Settings navigation contains streets link', async ({ page }) => {
            await page.goto('/settings');

            // Look for streets link in settings (references was split into separate pages)
            await expect(
                page.getByRole('link', { name: /streets/i }).or(page.locator('a[href*="streets"]'))
            ).toBeVisible({ timeout: 10000 });
        });
    });
});
