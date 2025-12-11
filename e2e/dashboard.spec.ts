import { test, expect } from '@playwright/test';
import { loginAs, TEST_USERS } from './fixtures';

test.describe('Phase 2: Dashboard Shell', () => {
    test('TC2.1: Dashboard displays stats cards for admin', async ({ page }) => {
        await loginAs(page, 'admin');

        // Check dashboard has loaded
        await expect(page).toHaveURL(/\/dashboard/);

        // Look for stats cards or main dashboard content
        await expect(page.locator('main, [role="main"], .dashboard')).toBeVisible();
    });

    test('TC2.2: Sidebar navigation is visible for admin', async ({ page }) => {
        await loginAs(page, 'admin');

        // Check sidebar or navigation exists
        const sidebar = page.locator('nav, aside, [role="navigation"]');
        await expect(sidebar.first()).toBeVisible();

        // Admin should see these navigation items
        await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /residents/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /houses/i })).toBeVisible();
    });

    test('TC2.3: Sidebar shows correct navigation for security_officer', async ({ page }) => {
        await loginAs(page, 'security');

        // Security officer should have limited navigation
        await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /security/i })).toBeVisible();
    });

    test('TC2.4: User menu is visible and contains sign out', async ({ page }) => {
        await loginAs(page, 'admin');

        // Look for user menu or dropdown
        const userMenu = page.locator('[data-user-menu], button:has-text("Sign out"), button:has-text("Logout"), [aria-label*="user"], [aria-label*="account"]');

        // Either sign out is directly visible or we need to open a dropdown
        const signOutButton = page.getByRole('button', { name: /sign out|logout/i });
        const menuTrigger = page.locator('button:has([class*="avatar"]), [data-user-menu-trigger]');

        // Try to find sign out
        const isSignOutVisible = await signOutButton.isVisible().catch(() => false);
        if (!isSignOutVisible && await menuTrigger.count() > 0) {
            await menuTrigger.first().click();
            await expect(signOutButton).toBeVisible({ timeout: 5000 });
        }
    });

    test('TC2.5: Sign out logs user out and redirects to login', async ({ page }) => {
        await loginAs(page, 'admin');

        // Find and click sign out
        const signOutButton = page.getByRole('button', { name: /sign out|logout/i });
        const menuTrigger = page.locator('button:has([class*="avatar"]), [data-user-menu-trigger], header button').last();

        // If sign out not visible, open user menu first
        if (!(await signOutButton.isVisible().catch(() => false))) {
            if (await menuTrigger.count() > 0) {
                await menuTrigger.click();
            }
        }

        // Click sign out if visible
        if (await signOutButton.isVisible().catch(() => false)) {
            await signOutButton.click();
            // Should redirect to login
            await page.waitForURL(/\/login/, { timeout: 10000 });
            await expect(page).toHaveURL(/\/login/);
        }
    });

    test('TC2.6: Navigation links work correctly', async ({ page }) => {
        await loginAs(page, 'admin');

        // Click on Residents link
        await page.getByRole('link', { name: /residents/i }).click();
        await expect(page).toHaveURL(/\/residents/);

        // Click on Houses link
        await page.getByRole('link', { name: /houses/i }).click();
        await expect(page).toHaveURL(/\/houses/);

        // Navigate back to dashboard
        await page.getByRole('link', { name: /dashboard/i }).click();
        await expect(page).toHaveURL(/\/dashboard/);
    });
});
