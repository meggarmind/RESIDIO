import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures';

test.describe('Phase 1: Authentication & RBAC', () => {
    test.beforeEach(async ({ page }) => {
        // Clear any existing session
        await page.context().clearCookies();
    });

    test('TC1.1: Login page loads correctly', async ({ page }) => {
        await page.goto('/login');

        // Check for login form elements
        await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('TC1.2: Valid admin login redirects to dashboard', async ({ page }) => {
        await page.goto('/login');

        // Fill in credentials
        await page.fill('input[type="email"], input[name="email"]', TEST_USERS.admin.email);
        await page.fill('input[type="password"]', TEST_USERS.admin.password);

        // Submit form
        await page.click('button[type="submit"]');

        // Wait for redirect to dashboard
        await page.waitForURL(/\/dashboard/, { timeout: 15000 });

        // Verify we're on the dashboard
        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('TC1.3: Invalid credentials show error message', async ({ page }) => {
        await page.goto('/login');

        // Fill in invalid credentials
        await page.fill('input[type="email"], input[name="email"]', 'invalid@test.com');
        await page.fill('input[type="password"]', 'wrongpassword');

        // Submit form
        await page.click('button[type="submit"]');

        // Wait for error message (toast or form error)
        await expect(page.locator('[role="alert"], .error, [data-sonner-toast]')).toBeVisible({ timeout: 10000 });
    });

    test('TC1.4: Unauthenticated access to dashboard redirects to login', async ({ page }) => {
        // Try to access dashboard without logging in
        await page.goto('/dashboard');

        // Should be redirected to login
        await page.waitForURL(/\/login/, { timeout: 10000 });
        await expect(page).toHaveURL(/\/login/);
    });

    test('TC1.5: Financial secretary can login successfully', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[type="email"], input[name="email"]', TEST_USERS.finance.email);
        await page.fill('input[type="password"]', TEST_USERS.finance.password);
        await page.click('button[type="submit"]');

        await page.waitForURL(/\/dashboard/, { timeout: 15000 });
        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('TC1.6: Security officer can login successfully', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[type="email"], input[name="email"]', TEST_USERS.security.email);
        await page.fill('input[type="password"]', TEST_USERS.security.password);
        await page.click('button[type="submit"]');

        await page.waitForURL(/\/dashboard/, { timeout: 15000 });
        await expect(page).toHaveURL(/\/dashboard/);
    });
});
