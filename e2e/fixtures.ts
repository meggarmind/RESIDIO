import { Page } from '@playwright/test';

// Test user credentials
export const TEST_USERS = {
    admin: { email: 'admin@residio.test', password: 'password123', role: 'admin' },
    chairman: { email: 'chairman@residio.test', password: 'password123', role: 'chairman' },
    finance: { email: 'finance@residio.test', password: 'password123', role: 'financial_secretary' },
    security: { email: 'security@residio.test', password: 'password123', role: 'security_officer' },
};

// Helper function for authenticated tests
export async function loginAs(page: Page, userType: keyof typeof TEST_USERS) {
    const user = TEST_USERS[userType];
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}
