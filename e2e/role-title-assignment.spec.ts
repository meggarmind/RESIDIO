import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';

// Issue #827: choose a role, then a title under it, on the Roles & Access page.
// The flow stops at the confirmation dialog and cancels, so a run never changes
// who holds a role on the shared Stage database. The write path is covered by
// src/__tests__/assign-role-titles.test.ts.

test.describe('Role and title assignment (#827)', () => {
    test('picking a role offers its titles and the confirmation names the title', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/system/accounts?tab=administrators');

        await page.getByRole('radio', { name: 'Search accounts' }).click();
        await page.getByRole('combobox').filter({ hasText: 'Search by name or email' }).click();
        await page.getByPlaceholder('Search accounts...').fill('residio.test');
        await page.getByRole('option').first().click();

        await page.getByRole('combobox').filter({ hasText: /Select a role to assign|Chairman|Secretary|Treasurer/ }).first().click();
        await page.getByRole('option', { name: 'Secretary' }).click();

        // The title list is that role's own titles, not every title.
        await page.getByRole('combobox', { name: 'Title' }).click();
        await expect(page.getByRole('option', { name: 'Assistant Secretary' })).toBeVisible();
        await expect(page.getByRole('option', { name: 'Vice Chairman' })).toHaveCount(0);
        await page.getByRole('option', { name: 'Assistant Secretary' }).click();

        await page.getByRole('button', { name: 'Assign Role' }).click();
        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toContainText('Assistant Secretary');
        await dialog.getByRole('button', { name: 'Cancel' }).click();
    });

    test('the Roles tab lists titles with seats and offers Add title', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/system/accounts?tab=roles');

        await expect(page.getByRole('heading', { name: 'Titles' })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Vice Chairman').first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add title to Chairman' })).toBeVisible();
    });
});
