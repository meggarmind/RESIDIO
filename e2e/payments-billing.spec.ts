import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

test.describe('Phase 5: Payment & Billing System', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test.describe('5.1 Payment Records', () => {
        test('TC5.1: Payments list page loads', async ({ page }) => {
            await page.goto('/payments');

            // Check for payments table
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });
        });

        test('TC5.2: Navigate to new payment form', async ({ page }) => {
            await page.goto('/payments');

            // Click on add payment button
            const addButton = page.getByRole('link', { name: /add|new|record/i }).or(
                page.getByRole('button', { name: /add|new|record/i })
            );
            await addButton.click();

            // Should be on new payment page
            await expect(page).toHaveURL(/\/payments\/new/);
        });

        test('TC5.3: Payment form shows required fields', async ({ page }) => {
            await page.goto('/payments/new');

            // Check for amount field
            await expect(page.locator('input[name="amount"], input[placeholder*="amount"], input[placeholder*="0"]')).toBeVisible();

            // Check for resident select
            await expect(page.locator('select, [role="combobox"]').first()).toBeVisible();

            // Check for submit button
            await expect(page.getByRole('button', { name: /create|save|record|submit/i })).toBeVisible();
        });

        test('TC5.4: Payment form validates amount', async ({ page }) => {
            await page.goto('/payments/new');

            // Try to submit without amount
            await page.getByRole('button', { name: /create|save|record|submit/i }).click();

            // Check for validation error (form uses data-slot="form-message" for errors)
            // Use .first() since multiple validation messages may be shown
            await expect(page.locator('[data-slot="form-message"]').first()).toBeVisible({ timeout: 5000 });
        });

        test('TC5.5: Payment filters are visible', async ({ page }) => {
            await page.goto('/payments');

            // Look for filter controls
            const filterElements = page.locator('select, [role="combobox"], input[type="search"], input[placeholder*="search"]');
            await expect(filterElements.first()).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('5.2 Payment Detail Page', () => {
        test('TC5.6: Payment detail page has tabs', async ({ page }) => {
            await page.goto('/payments');

            // Wait for table to load
            await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });

            // Find and click on first payment row's view link (icon button with Eye icon)
            const viewLink = page.locator('table tbody tr').first().locator('a[href*="/payments/"]');

            if (await viewLink.count() > 0) {
                await viewLink.first().click();

                // Wait for page to load
                await page.waitForLoadState('networkidle');

                // Check for tabs (Edit Details, Receipt Preview)
                await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 10000 });
            }
        });

        test('TC5.7: Receipt preview tab is accessible', async ({ page }) => {
            await page.goto('/payments');

            // Click on first payment to view details
            const viewLink = page.locator('table tbody tr').first().locator('a, button:has-text("View")').first();

            if (await viewLink.count() > 0) {
                await viewLink.click();
                await page.waitForLoadState('networkidle');

                // Click on Receipt tab
                const receiptTab = page.getByRole('tab', { name: /receipt/i });
                if (await receiptTab.isVisible()) {
                    await receiptTab.click();
                    // Receipt content should be visible
                    await expect(page.locator('text=Receipt')).toBeVisible({ timeout: 5000 });
                }
            }
        });
    });

    test.describe('5.3 Bulk Operations', () => {
        test('TC5.8: Checkbox selection is available in payment table', async ({ page }) => {
            await page.goto('/payments');

            // Check for checkboxes in the table
            await expect(page.locator('input[type="checkbox"], [role="checkbox"]').first()).toBeVisible({ timeout: 10000 });
        });

        test('TC5.9: Selecting payments shows action bar', async ({ page }) => {
            await page.goto('/payments');

            // Wait for table to load and page to stabilize
            await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
            await page.waitForLoadState('networkidle');

            // Click on first checkbox in table body using check() for Radix checkbox
            const checkbox = page.locator('tbody [role="checkbox"]').first();

            if (await checkbox.count() > 0) {
                // Use check() method for Radix checkbox to ensure state is toggled
                await checkbox.check();

                // Wait for React state update and action bar to appear
                // Action bar shows "X payment(s) selected" text
                await expect(page.locator('text=/\\d+ payment.*selected/')).toBeVisible({ timeout: 5000 });
            }
        });

        test('TC5.10: Export CSV button is available', async ({ page }) => {
            await page.goto('/payments');

            // Wait for table to load and page to stabilize
            await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });
            await page.waitForLoadState('networkidle');

            // Select a payment first - use check() for Radix checkbox
            const checkbox = page.locator('tbody [role="checkbox"]').first();
            if (await checkbox.count() > 0) {
                await checkbox.check();

                // Wait for action bar to appear, then look for export button
                await expect(page.locator('text=/\\d+ payment.*selected/')).toBeVisible({ timeout: 5000 });
                await expect(page.getByRole('button', { name: /export.*csv/i })).toBeVisible({ timeout: 5000 });
            }
        });
    });

    test.describe('5.4 Billing & Invoices', () => {
        test('TC5.11: Billing page loads', async ({ page }) => {
            await page.goto('/billing');

            // Wait for page to fully load
            await page.waitForLoadState('networkidle');

            // Check for billing page content
            await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
            await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible({ timeout: 10000 });
        });

        test('TC5.12: Generate Invoices button is visible', async ({ page }) => {
            await page.goto('/billing');

            // Check for generate invoices button
            await expect(page.getByRole('button', { name: /generate/i })).toBeVisible({ timeout: 10000 });
        });

        test('TC5.13: Check Overdue button is visible', async ({ page }) => {
            await page.goto('/billing');

            // Check for check overdue button
            await expect(page.getByRole('button', { name: /overdue/i })).toBeVisible({ timeout: 10000 });
        });

        test('TC5.14: Invoices table is displayed', async ({ page }) => {
            await page.goto('/billing');

            // Check for invoices table
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });
        });

        test('TC5.15: Invoice filters are available', async ({ page }) => {
            await page.goto('/billing');

            // Look for filter controls
            const filterElements = page.locator('select, [role="combobox"]');
            await expect(filterElements.first()).toBeVisible({ timeout: 10000 });
        });

        test('TC5.16: Refresh button works', async ({ page }) => {
            await page.goto('/billing');

            // Click refresh button
            const refreshBtn = page.getByRole('button', { name: /refresh/i });
            await expect(refreshBtn).toBeVisible({ timeout: 10000 });
            await refreshBtn.click();

            // Table should still be visible after refresh
            await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('5.5 Wallet System', () => {
        test('TC5.17: Resident detail shows wallet section', async ({ page }) => {
            await page.goto('/residents');

            // Click on first resident to view details
            const viewLink = page.locator('table tbody tr').first().locator('a, button').first();

            if (await viewLink.count() > 0) {
                await viewLink.click();
                await page.waitForLoadState('networkidle');

                // Look for wallet section
                await expect(
                    page.locator('text=Wallet').or(page.locator('text=Balance'))
                ).toBeVisible({ timeout: 10000 });
            }
        });
    });
});
