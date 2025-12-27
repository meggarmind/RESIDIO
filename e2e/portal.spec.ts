import { test, expect } from '@playwright/test';
import { loginForPortal } from './fixtures';

test.describe('Phase 12: Resident Portal', () => {
    test.beforeEach(async ({ page }) => {
        // Login as admin (who is linked to a resident) and navigate to portal
        await loginForPortal(page, 'admin');
    });

    test('Portal home page loads and shows welcome message', async ({ page }) => {
        await page.goto('/portal');
        await page.waitForLoadState('networkidle');

        // Should see the welcome heading
        await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible({ timeout: 10000 });
        // Should see wallet balance section
        await expect(page.getByText('Wallet Balance')).toBeVisible();
    });

    test('Portal invoices page loads', async ({ page }) => {
        await page.goto('/portal/invoices');
        await page.waitForLoadState('networkidle');

        // Should see the Payments heading
        await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible({ timeout: 10000 });
        // Should see the payment history description
        await expect(page.getByText('View your invoices and payment history')).toBeVisible();
    });

    test('Portal security contacts page loads', async ({ page }) => {
        await page.goto('/portal/security-contacts');
        await page.waitForLoadState('networkidle');

        // Should see the security contacts heading (h1)
        await expect(page.getByRole('heading', { name: 'Security Contacts', level: 1 })).toBeVisible({ timeout: 10000 });
        // Should see the description
        await expect(page.getByText('Manage access for your visitors')).toBeVisible();
    });

    test('Portal profile page loads', async ({ page }) => {
        await page.goto('/portal/profile');
        await page.waitForLoadState('networkidle');

        // Should see the profile heading
        await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible({ timeout: 10000 });
        // Should see account info description
        await expect(page.getByText('Your account information')).toBeVisible();
    });

    test('Portal bottom navigation exists', async ({ page }) => {
        await page.goto('/portal');
        await page.waitForLoadState('networkidle');

        // Check bottom nav links exist (use .first() for links that may appear multiple times)
        await expect(page.locator('nav a[href="/portal"]').first()).toBeVisible();
        await expect(page.locator('nav a[href="/portal/invoices"]').first()).toBeVisible();
        await expect(page.locator('nav a[href="/portal/security-contacts"]').first()).toBeVisible();
        await expect(page.locator('nav a[href="/portal/profile"]').first()).toBeVisible();
    });
});
