import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';
import { p75 } from './helpers/p75';

// Benchmark for #970 (targets from #63). Skipped unless PERF_BASE_URL is set, so a normal
// `npm run test:e2e` is unaffected. Thresholds only fail the run when PERF_ENFORCE=true.
//   PERF_BASE_URL=<url> [PERF_ENFORCE=true] [PERF_RUNS=20] npx playwright test e2e/perf-admin.spec.ts

const BASE_URL = process.env.PERF_BASE_URL;
const ENFORCE = process.env.PERF_ENFORCE === 'true';
const RUNS = Math.max(20, Number(process.env.PERF_RUNS) || 20);

const DASHBOARD_TARGET_MS = 2000;
const LIST_TARGET_MS = 800;

// Primary admin lists, from the admin sidebar. Confirm the set with the owner (#970).
// Ready signal per list: the first <tbody> row that holds no skeleton (data-slot="skeleton"), so the
// timer stops on real data (or the empty-state row), not the table shell.
//   residents: residents-table.tsx renders skeleton rows while isLoading, then ResidentRow
//   houses:    houses-table.tsx renders skeleton rows while isLoading, then HouseRow
//   invoices:  billing/page.tsx renders skeleton rows while isLoading, then invoice rows
//   payments:  payments/page.tsx renders the table only after loading, so any <tbody> row is data
const LIST_ROW_READY = 'main tbody tr:not(:has([data-slot="skeleton"]))';
const LIST_PAGES = [
    { name: 'residents', path: '/residents' },
    { name: 'houses', path: '/houses' },
    { name: 'invoices', path: '/billing' },
    { name: 'payments', path: '/payments' },
];

const DASHBOARD = { name: 'dashboard', path: '/dashboard', ready: '[data-testid="command-strip"]', targetMs: DASHBOARD_TARGET_MS };
const PAGES = [
    DASHBOARD,
    ...LIST_PAGES.map((p) => ({ ...p, ready: LIST_ROW_READY, targetMs: LIST_TARGET_MS })),
];

test.describe('admin performance benchmark', () => {
    test.skip(!BASE_URL, 'set PERF_BASE_URL to run the benchmark');
    test.use({ baseURL: BASE_URL });
    test.setTimeout(10 * 60 * 1000);

    test('p75 load time per page', async ({ page }) => {
        await loginAs(page, 'admin');

        const results: { name: string; p75: number; targetMs: number }[] = [];
        for (const { name, path, ready, targetMs } of PAGES) {
            const target = page.locator(ready).first();
            // Warm-up load, not measured.
            await page.goto(path);
            await target.waitFor({ state: 'visible' });

            const samples: number[] = [];
            for (let i = 0; i < RUNS; i++) {
                const start = Date.now();
                await page.goto(path);
                await target.waitFor({ state: 'visible' });
                samples.push(Date.now() - start);
            }
            results.push({ name, p75: p75(samples), targetMs });
        }

        console.table(results.map((r) => ({ page: r.name, runs: RUNS, 'p75 ms': r.p75, 'target ms': r.targetMs })));

        if (ENFORCE) {
            for (const r of results) {
                expect(r.p75, `${r.name} p75 (ms)`).toBeLessThanOrEqual(r.targetMs);
            }
        }
    });
});
