import { Page } from '@playwright/test';

// Test user credentials
export const TEST_USERS = {
    admin: { email: 'admin@residio.test', password: 'password123', role: 'admin' },
    chairman: { email: 'chairman@residio.test', password: 'password123', role: 'chairman' },
    finance: { email: 'finance@residio.test', password: 'password123', role: 'financial_secretary' },
    security: { email: 'security@residio.test', password: 'password123', role: 'security_officer' },
};

// Helper function for authenticated tests (expects dashboard redirect)
export async function loginAs(page: Page, userType: keyof typeof TEST_USERS) {
    const user = TEST_USERS[userType];
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"], input[name="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    // Press Enter to submit form - more reliable than clicking through overlays
    await page.press('input[type="password"]', 'Enter');
    // Wait for either dashboard or portal redirect (admin is linked to resident).
    // Under a cold dev server the redirect can stall even though the session cookie
    // is already set; recover by reloading once and waiting again.
    try {
        await page.waitForURL(/\/(dashboard|portal)/, { timeout: 45000 });
    } catch {
        await page.reload();
        await page.waitForURL(/\/(dashboard|portal)/, { timeout: 45000 });
    }
}

// Helper for portal tests - login and navigate to portal
export async function loginForPortal(page: Page, userType: keyof typeof TEST_USERS) {
    const user = TEST_USERS[userType];
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"], input[name="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    // Press Enter to submit form - more reliable than clicking through overlays
    await page.press('input[type="password"]', 'Enter');
    // Wait for redirect then navigate to portal
    await page.waitForURL(/\/(dashboard|portal)/, { timeout: 30000 });
    // Ensure we're on the portal
    if (!page.url().includes('/portal')) {
        await page.goto('/portal');
        await page.waitForLoadState('networkidle');
    }
}

// The classic dashboard sidebar defaults to COLLAPSED (icon-only) on desktop; it only
// reveals text labels while hovered (onMouseEnter => hover-expand). Call this before
// asserting/clicking sidebar links, and again after each client-side navigation.
export async function expandSidebar(page: Page) {
    const aside = page.locator('aside').first();
    await aside.hover();
    await page.waitForTimeout(250);
}
