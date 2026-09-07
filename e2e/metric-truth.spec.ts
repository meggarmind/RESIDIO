import { test, expect, Page, Locator } from '@playwright/test';
import { loginAs } from './fixtures';

/**
 * Metric-truth verification for the pilot defect family: #109, #110, #111, #114.
 *
 * Every expectation is a figure measured directly against the live cloud Supabase
 * database on 2026-09-07, NOT a figure copied from an issue body (the issue bodies
 * are up to three weeks old and several of their numbers had already moved on).
 *
 *   invoices        589 total = 570 paid + 19 unpaid + 0 partially_paid + 0 void
 *   overdue         19 (derived: unpaid/partially_paid AND due_date < today)
 *   sum(amount_due) NGN 3,285,000.00
 *   payment_records 2259 rows, every one status='paid', sum(amount) NGN 39,436,963.00
 *   house 18A (f866af4d-...) totalOutstanding = NGN 100,000
 */

const TRUTH = {
    invoicesTotal: 589,
    paid: 570,
    unpaid: 19,
    overdue: 19,
    totalAmountDue: 3_285_000,
    paymentsPaid: 2259,
    house18aId: 'f866af4d-4f58-48fc-826e-df7684bdaa83',
    house18aOutstanding: 100_000,
};

function nairaToNumber(text: string): number {
    return Math.round(Number(text.replace(/[^\d.]/g, '')));
}

function intFrom(text: string): number {
    return Number(text.replace(/[^\d]/g, ''));
}

function statCard(page: Page, title: RegExp): Locator {
    return page
        .locator('[data-slot="card"]')
        .filter({ has: page.locator('[data-slot="card-title"]').filter({ hasText: title }) })
        .first();
}

async function statValue(page: Page, title: RegExp): Promise<string> {
    const card = statCard(page, title);
    await expect(card).toBeVisible({ timeout: 30_000 });
    const value = card.locator('[data-slot="card-content"] > div').first();
    await expect(value).toBeVisible({ timeout: 30_000 });
    return (await value.innerText()).trim();
}

async function settled(page: Page, title: RegExp) {
    const card = statCard(page, title);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.locator('[data-slot="skeleton"], .animate-pulse')).toHaveCount(0, {
        timeout: 60_000,
    });
}

test.describe('#111 /billing stat cards are estate-wide, not page-scoped', () => {
    test('Paid, Unpaid and Total Value report the whole estate', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/billing');
        await page.waitForLoadState('networkidle');

        for (const t of [/^Total Invoices$/, /^Paid$/, /^Unpaid$/, /^Total Value$/]) {
            await settled(page, t);
        }

        expect(intFrom(await statValue(page, /^Total Invoices$/))).toBe(TRUTH.invoicesTotal);
        expect(intFrom(await statValue(page, /^Paid$/))).toBe(TRUTH.paid);
        expect(intFrom(await statValue(page, /^Unpaid$/))).toBe(TRUTH.unpaid);
        expect(nairaToNumber(await statValue(page, /^Total Value$/))).toBe(TRUTH.totalAmountDue);

        // The page-size tell from the QA report: 12 + 8 = 20 was the page size.
        const paid = intFrom(await statValue(page, /^Paid$/));
        const unpaid = intFrom(await statValue(page, /^Unpaid$/));
        expect(paid + unpaid).not.toBe(20);
    });

    test('no card claims to be a page total any more', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/billing');
        await page.waitForLoadState('networkidle');
        await settled(page, /^Total Value$/);
        await expect(page.getByText('Current page total', { exact: false })).toHaveCount(0);
    });

    test('paging to page 2 does not change the cards', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/billing');
        await page.waitForLoadState('networkidle');
        await settled(page, /^Paid$/);

        const before = {
            total: await statValue(page, /^Total Invoices$/),
            paid: await statValue(page, /^Paid$/),
            unpaid: await statValue(page, /^Unpaid$/),
            value: await statValue(page, /^Total Value$/),
        };

        const next = page.getByRole('button', { name: /next/i }).first();
        await expect(next).toBeEnabled({ timeout: 30_000 });
        await next.click();
        await page.waitForLoadState('networkidle');
        await settled(page, /^Paid$/);

        expect(await statValue(page, /^Total Invoices$/)).toBe(before.total);
        expect(await statValue(page, /^Paid$/)).toBe(before.paid);
        expect(await statValue(page, /^Unpaid$/)).toBe(before.unpaid);
        expect(await statValue(page, /^Total Value$/)).toBe(before.value);
    });
});

test.describe('#110 dashboard invoice status counts form a partition', () => {
    test('the charted buckets sum to the true invoice count, not an inflated one', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // The live component is ModernPendingPayments, heading "Invoice Status Counts"
        // (NOT the dead InvoiceDistributionCard the issue body cites).
        const heading = page.getByRole('heading', { name: /Invoice Status Counts/i });
        await expect(heading).toBeVisible({ timeout: 90_000 });

        // Walk up to the card container that holds the legend grid. The component's
        // root is the nearest ancestor carrying the rounded-xl card class.
        const panel = heading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
        const panelText = await panel.innerText();
        console.log('=== Invoice Status Counts panel ===');
        console.log(panelText);

        const counts: Record<string, number> = {};
        for (const label of ['Overdue', 'Unpaid', 'Partially paid', 'Paid', 'Void']) {
            const re = new RegExp('(?:^|\\n)' + label + '\\s*\\n?\\s*(\\d[\\d,]*)', 'i');
            const m = panelText.match(re);
            counts[label] = m ? intFrom(m[1]) : NaN;
        }
        console.log('parsed counts:', JSON.stringify(counts));

        const sum = Object.values(counts).reduce((a, b) => a + b, 0);
        expect(sum).toBe(TRUTH.invoicesTotal);
        expect(sum).not.toBe(TRUTH.invoicesTotal + TRUTH.overdue); // the old 608

        expect(counts['Paid']).toBe(TRUTH.paid);
        expect(counts['Overdue']).toBe(TRUTH.overdue);
        // Today every unpaid invoice is also overdue, so Unpaid nets to 0 once the
        // overdue subset is removed. That is correct, not a regression.
        expect(counts['Unpaid']).toBe(TRUTH.unpaid - TRUTH.overdue);
    });
});

test.describe('#114 /payments Completed card reports real completions', () => {
    test('Completed shows the paid payment count even with nothing pending', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/payments');
        await page.waitForLoadState('networkidle');
        await settled(page, /^Completed$/);

        const completed = intFrom(await statValue(page, /^Completed$/));
        const collected = nairaToNumber(await statValue(page, /^Total Collected$/));
        console.log('Completed =', completed, '| Total Collected =', collected);

        expect(completed).not.toBe(0);
        expect(completed).toBe(TRUTH.paymentsPaid);
        expect(intFrom(await statValue(page, /^Pending$/))).toBe(0);
    });
});

test.describe('#109 house detail Financial Status is derived, not asserted', () => {
    test('18A reports its real outstanding balance', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text());
        });

        await loginAs(page, 'admin');
        await page.goto(`/houses/${TRUTH.house18aId}`);
        await page.waitForLoadState('networkidle');

        const card = page
            .locator('[data-slot="card"]')
            .filter({ has: page.locator('[data-slot="card-title"]').filter({ hasText: /^Financial Status$/ }) })
            .first();
        await expect(card).toBeVisible({ timeout: 90_000 });

        // Give the payment-status query time to resolve before reading the card.
        await expect(card.locator('[data-slot="skeleton"], .animate-pulse')).toHaveCount(0, {
            timeout: 60_000,
        });

        console.log('=== Financial Status card ===');
        console.log(await card.innerText());
        if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 5));

        const value = card.locator('[data-slot="card-content"] > div').first();
        await expect(value).not.toHaveText(/Clear/i, { timeout: 60_000 });
        await expect(card).not.toContainText(/unavailable/i);
        expect(nairaToNumber(await value.innerText())).toBe(TRUTH.house18aOutstanding);
        await expect(card).toContainText(/Outstanding dues/i);
    });

    test('no page asserts an inspection compliance fact', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto(`/houses/${TRUTH.house18aId}`);
        await page.waitForLoadState('networkidle');

        await expect(page.getByText('Compliance verified', { exact: false })).toHaveCount(0);
        await expect(page.getByText('2025-12-01', { exact: false })).toHaveCount(0);
    });
});
