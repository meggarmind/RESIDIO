import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

test.describe('Wallet payment batches', () => {
    test.describe.configure({ timeout: 180000 });

    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test('Wallet Check report is available from admin Reports', async ({ page }) => {
        await page.goto('/reports', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async () => {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        });
        const walletTab = page.getByRole('tab', { name: /Wallet Check/i });
        await walletTab.click({ force: true });
        await expect(walletTab).toHaveAttribute('data-state', 'active', { timeout: 60000 });
        await expect(page.getByText('Wallet batch reconciliation')).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('button', { name: /Run reconciliation/i })).toBeVisible({ timeout: 60000 });
    });

    test('resident finance card exposes settlement confirmation entry point', async ({ page }) => {
        await page.goto('/residents/01076f00-cd99-58eb-a33f-a7685c9c625a', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.getByRole('tab', { name: /Transactions/i }).click();
        await expect(page.getByText('Wallet payment batches')).toBeVisible();
        await expect(page.getByRole('button', { name: /Settle selected/i })).toBeVisible();
    });
});
