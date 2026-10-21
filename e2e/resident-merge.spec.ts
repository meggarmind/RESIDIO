import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

// #988: opens the Merge residents dialog and checks its guards. It never presses Merge, so it
// changes no data in the database it runs against.
test.describe('Merge residents', () => {
    test.describe.configure({ timeout: 180000 });

    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test('super admin can open the merge dialog, and Merge stays disabled before a confirmation', async ({ page }) => {
        await page.goto('/residents', { waitUntil: 'domcontentloaded', timeout: 120000 });
        // Each row's Edit link carries the resident id; open the detail page from it.
        const editLink = page.locator('a[href^="/residents/"][href$="?edit=true"]').first();
        await expect(editLink).toBeAttached({ timeout: 60000 });
        const href = (await editLink.getAttribute('href'))!;
        await page.goto(href.replace('?edit=true', ''), { waitUntil: 'domcontentloaded', timeout: 120000 });

        await page.getByRole('button', { name: /More/ }).click();
        await page.getByRole('menuitem', { name: 'Merge residents' }).click();

        const dialog = page.getByRole('dialog', { name: 'Merge residents' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('combobox')).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Merge residents' })).toBeDisabled();

        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
    });
});
