import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { loginAs } from './fixtures';

const DASHBOARD_CACHE_NAME = 'residio-admin-read-cache';
const DASHBOARD_CACHE_KEY = 'dashboard:snapshot';

async function loginAsSeededAdminOrSkip(page: Page, testInfo: TestInfo): Promise<boolean> {
    try {
        await loginAs(page, 'admin');
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/dashboard/);
        return true;
    } catch {
        testInfo.skip(true, 'Seeded admin auth or the cloud-backed dashboard is unavailable locally.');
        return false;
    }
}

async function hasDashboardSnapshot(page: Page): Promise<boolean> {
    return page.evaluate(({ databaseName, cacheKey }) => new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 3000);
        const request = window.indexedDB.open(databaseName, 1);

        request.onerror = () => {
            window.clearTimeout(timeout);
            resolve(false);
        };
        request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('snapshots', 'readonly');
            const keysRequest = transaction.objectStore('snapshots').getAllKeys();

            keysRequest.onerror = () => {
                database.close();
                window.clearTimeout(timeout);
                resolve(false);
            };
            keysRequest.onsuccess = () => {
                database.close();
                window.clearTimeout(timeout);
                resolve(keysRequest.result.some((key) => String(key).endsWith(`:${cacheKey}`)));
            };
        };
    }), { databaseName: DASHBOARD_CACHE_NAME, cacheKey: DASHBOARD_CACHE_KEY });
}

test.describe('Admin offline read snapshots', () => {
    test('renders the cached dashboard read and offline banner', async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        if (!(await loginAsSeededAdminOrSkip(page, testInfo))) return;

        await expect(page.getByText('Monthly Revenue').first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Collection').first()).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => hasDashboardSnapshot(page), { timeout: 10_000 }).toBe(true);

        await page.context().setOffline(true);
        await expect(page.getByText(/Recent admin data may be stale; writes are disabled/i)).toBeVisible();

        // Retry forces the dashboard query function to take its IndexedDB fallback path.
        await page.getByRole('button', { name: /retry/i }).click();
        await expect(page.getByText('Monthly Revenue').first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText('Collection').first()).toBeVisible({ timeout: 10_000 });
    });

    test('blocks an admin payment mutation while offline', async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        if (!(await loginAsSeededAdminOrSkip(page, testInfo))) return;

        await page.goto('/payments/new');
        try {
            await expect(page.getByRole('heading', { name: /record payment/i })).toBeVisible({ timeout: 30_000 });
        } catch {
            testInfo.skip(true, 'Seeded admin payment route is unavailable locally.');
            return;
        }

        const residentSelect = page.getByRole('combobox').first();
        await expect(residentSelect).toBeVisible({ timeout: 20_000 });
        await residentSelect.click();

        const firstResident = page.getByRole('option').first();
        if (!(await firstResident.isVisible().catch(() => false))) {
            testInfo.skip(true, 'No seeded residents are available to submit the payment form.');
            return;
        }
        await firstResident.click();
        await page.locator('input[name="amount"]').fill('1');

        let nextActionPostCount = 0;
        page.on('request', (request) => {
            if (request.method() === 'POST' && request.headers()['next-action']) nextActionPostCount += 1;
        });

        await page.context().setOffline(true);
        await expect(page.getByText(/Recent admin data may be stale; writes are disabled/i)).toBeVisible();
        await page.getByRole('button', { name: /record payment/i }).click();

        await expect(page.getByText(/This action requires an internet connection/i)).toBeVisible({ timeout: 10_000 });
        expect(nextActionPostCount).toBe(0);
        await expect(page.getByRole('heading', { name: /record payment/i })).toBeVisible();
    });
});
