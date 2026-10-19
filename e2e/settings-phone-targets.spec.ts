import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './fixtures';

// Issue #788: settings controls are at least 44px on a phone, and the roles page does not
// scroll sideways at 1440. Axe on the busiest settings pages is a follow-up.

const PHONE_PAGES = [
    '/settings/streets',
    '/settings/house-types',
    '/settings/transaction-tags',
    '/settings/bank-accounts',
    '/settings/roles',
];

// Tabs are navigation, out of scope here; inline text links are exempt from the target-size rule.
const CONTROLS = 'button:not([role="tab"]), [role="switch"], [role="checkbox"], [role="combobox"], input:not([type="hidden"]), select, textarea';

/** Visible controls in the settings content whose hit area (box plus any ::after pad) is under 44px. */
async function undersizedControls(page: Page): Promise<string[]> {
    return page.getByTestId('settings-content').evaluate((root, selector) => {
        const out: string[] = [];
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            const after = getComputedStyle(el, '::after');
            let width = box.width;
            let height = box.height;
            if (after.position === 'absolute' && after.content !== 'none') {
                const px = (v: string) => (v.endsWith('px') ? parseFloat(v) : 0);
                width = Math.max(width, box.width - px(after.left) - px(after.right));
                height = Math.max(height, box.height - px(after.top) - px(after.bottom));
            }
            if (width < 44 || height < 44) {
                const name = el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
                out.push(`${name} (${Math.round(width)}x${Math.round(height)})`);
            }
        }
        return out;
    }, CONTROLS);
}

test.describe('Settings phone targets and layout (#788)', () => {
    for (const path of PHONE_PAGES) {
        test(`${path}: every control is at least 44px at 390`, async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await loginAs(page, 'admin');
            await page.goto(path);
            await expect(page.getByTestId('settings-content')).toBeVisible({ timeout: 20000 });
            await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0, { timeout: 20000 });
            expect(await undersizedControls(page)).toEqual([]);
        });
    }

    test('/settings/roles: no horizontal page scroll at 1440', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await loginAs(page, 'admin');
        await page.goto('/settings/roles');
        await expect(page.getByRole('button', { name: 'Add Role' })).toBeVisible({ timeout: 20000 });
        const overflow = await page.evaluate(() => {
            const main = document.querySelector('main') ?? document.documentElement;
            return Math.max(
                main.scrollWidth - main.clientWidth,
                document.documentElement.scrollWidth - document.documentElement.clientWidth
            );
        });
        expect(overflow).toBeLessThanOrEqual(0);
        const addRole = await page.getByRole('button', { name: 'Add Role' }).boundingBox();
        expect(addRole && addRole.x + addRole.width).toBeLessThanOrEqual(1440);
        await expect(page.getByRole('button', { name: /^Edit role/ }).first()).toBeVisible();
        // Row actions are visible without scrolling the table sideways ("Actions clipped").
        const clipped = await page.getByTestId('settings-content').evaluate((root) => {
            const right = root.getBoundingClientRect().right;
            return Array.from(root.querySelectorAll<HTMLElement>('button[aria-label^="Edit role"], button[aria-label^="Delete role"]'))
                .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > right)
                .map((el) => el.getAttribute('aria-label'));
        });
        expect(clipped).toEqual([]);
    });
});
