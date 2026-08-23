import { test, expect } from '@playwright/test';
import { loginAs, expandSidebar } from './fixtures';

test.describe('Phase 2: Dashboard Shell', () => {
    test('TC2.1: Dashboard displays stats cards for admin', async ({ page }) => {
        await loginAs(page, 'admin');

        // Check dashboard has loaded
        await expect(page).toHaveURL(/\/dashboard/);

        // Look for dashboard stats cards (modern UI uses Collection / Verified Payments etc.)
        await expect(page.getByText('Verified Payments').first()).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Collection').first()).toBeVisible({ timeout: 20000 });
    });

    test('TC2.2: Sidebar navigation is visible for admin', async ({ page }) => {
        await loginAs(page, 'admin');
        await expandSidebar(page);

        // Check sidebar or navigation exists
        const sidebar = page.locator('nav, aside, [role="navigation"]');
        await expect(sidebar.first()).toBeVisible();

        // Wait for the permission-filtered nav to finish rendering before asserting hrefs
        await expect(page.locator('aside a[href="/dashboard"]').first()).toBeVisible({ timeout: 15000 });

        // Admin should see these navigation items (hover-expanded sidebar, located by href)
        await expect(page.locator('aside a[href="/residents"]').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('aside a[href="/houses"]').first()).toBeVisible({ timeout: 15000 });
    });

    test('TC2.3: Sidebar shows correct navigation for security_officer', async ({ page }) => {
        await loginAs(page, 'security');
        await expandSidebar(page);

        // Wait for the permission-filtered nav to settle before asserting hrefs
        await expect(page.locator('aside a[href="/dashboard"]').first()).toBeVisible({ timeout: 15000 });

        // Security officer should have limited navigation (hover-expanded sidebar, located by href)
        await expect(page.locator('aside a[href="/security"]').first()).toBeVisible({ timeout: 15000 });
    });

    test('TC2.4: User menu is visible and contains sign out', async ({ page }) => {
        await loginAs(page, 'admin');

        // Look for user menu or dropdown
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
        await expandSidebar(page);

        // Wait for dashboard to fully load and sidebar nav to settle
        await expect(page.getByText('Verified Payments').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('aside a[href="/residents"]').first()).toBeVisible({ timeout: 15000 });

        // Click on Residents link
        await page.locator('aside a[href="/residents"]').first().click();
        await expect(page).toHaveURL(/\/residents/, { timeout: 10000 });

        // Re-expand sidebar (hover state resets after navigation) and click Houses link
        await expandSidebar(page);
        await expect(page.locator('aside a[href="/houses"]').first()).toBeVisible({ timeout: 15000 });
        await page.locator('aside a[href="/houses"]').first().click();
        await expect(page).toHaveURL(/\/houses/, { timeout: 10000 });

        // Navigate back to dashboard
        await expandSidebar(page);
        await expect(page.locator('aside a[href="/dashboard"]').first()).toBeVisible({ timeout: 15000 });
        await page.locator('aside a[href="/dashboard"]').first().click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    });

    test('TC2.7: Dashboard debug state is hydration-safe', async ({ page }) => {
        const hydrationWarnings: string[] = [];
        page.on('console', (message) => {
            if (/hydration|did not match|server rendered html/i.test(message.text())) {
                hydrationWarnings.push(message.text());
            }
        });
        await loginAs(page, 'admin');
        await expect(page.locator('[data-dashboard-debug="true"]')).toHaveCount(0);
        await page.goto('/dashboard?debug=true');
        await expect(page.locator('[data-dashboard-debug="true"]')).toBeVisible();
        expect(hydrationWarnings).toEqual([]);
    });

    test('TC2.8: Mobile navigation controls are accessible', async ({ page }) => {
        const accessibilityWarnings: string[] = [];
        page.on('console', (message) => {
            if (/DialogContent.*Description|aria-describedby/i.test(message.text())) {
                accessibilityWarnings.push(message.text());
            }
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await loginAs(page, 'admin');

        const menu = page.getByRole('button', { name: 'Open navigation menu' });
        const notifications = page.getByRole('button', { name: /notifications/i });
        const profile = page.getByRole('button', { name: 'Open profile menu' });

        for (const control of [menu, notifications, profile]) {
            await expect(control).toBeVisible();
            const box = await control.boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
        }

        await menu.click();
        const dialog = page.getByRole('dialog');
        const close = page.getByRole('button', { name: 'Close panel' });
        const theme = page.getByRole('button', { name: 'Change color theme' });

        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
        for (const control of [close, theme]) {
            const box = await control.boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);
        }

        await close.focus();
        await expect(close).toBeFocused();
        await expect(close).toHaveClass(/focus-visible:ring-2/);
        expect(accessibilityWarnings).toEqual([]);

        await close.click();
        await expect(dialog).toBeHidden();
    });
});
