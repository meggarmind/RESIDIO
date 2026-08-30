import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RESIDIO_BASE_URL ?? 'http://localhost:3000';
const email = process.env.RESIDIO_ADMIN_EMAIL;
const password = process.env.RESIDIO_ADMIN_PASSWORD;
const outputDir = path.resolve('docs/assets/admin');

// A cold `next dev` compiles each route on first hit, which can outrun the
// default settle time. Raise it rather than shipping a half-rendered page.
const settleMs = Number(process.env.RESIDIO_CAPTURE_WAIT_MS ?? 10_000);

// Playwright defaults to a 30s navigation timeout, which a cold `next dev`
// compile of a heavy route (e.g. /residents/new) routinely overruns.
const navTimeout = Number(process.env.RESIDIO_NAV_TIMEOUT_MS ?? 120_000);

/**
 * `--only dashboard-overview,cron-status` limits the run to named files.
 * Without it every screenshot is retaken, which silently rewrites images that
 * documented a populated screen with whatever the database holds today.
 */
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg === -1
  ? null
  : new Set((process.argv[onlyArg + 1] ?? '').split(',').map((n) => n.trim().replace(/\.png$/, '')).filter(Boolean));

const wanted = (file) => !only || only.has(file.replace(/\.png$/, ''));

if (!email || !password) {
  throw new Error('Set RESIDIO_ADMIN_EMAIL and RESIDIO_ADMIN_PASSWORD before capturing screenshots.');
}

const captures = [
  { route: '/dashboard', file: 'dashboard-overview.png' },
  { route: '/residents', file: 'residents-directory.png', maskTable: true },
  { route: '/residents/new', file: 'resident-create.png' },
  { route: '/houses', file: 'houses-directory.png', maskTable: true },
  { route: '/billing', file: 'billing-overview.png', maskTable: true },
  { route: '/payments', file: 'payments-directory.png', maskTable: true },
  { route: '/analytics', file: 'analytics-dashboard.png' },
  { route: '/security', file: 'security-contacts.png', maskTable: true },
  { route: '/approvals', file: 'approvals-queue.png', maskTable: true },
  { route: '/settings', file: 'settings-overview.png' },

  // Integrations. The WhatsApp console lists resident identifiers and phone
  // numbers, so it needs the table mask like the other directory pages.
  { route: '/settings/whatsapp', file: 'whatsapp-operations.png', maskTable: true },
  { route: '/settings/email-integration', file: 'email-integration.png' },
  { route: '/settings/email', file: 'email-settings.png' },
  { route: '/settings/cron-status', file: 'cron-status.png' },

  // The docs have always referenced this one, but it was missing from the list
  // and so could not be regenerated. `selector` clips to the nav rail.
  { route: '/dashboard', file: 'navigation-desktop.png', selector: 'aside' },
];

// Three independent loading-placeholder families exist in the app:
//  - the shadcn `Skeleton`, marked `data-slot="skeleton"`
//  - the dashboard's `ShimmerSkeleton`, marked `aria-busy="true"` (no data-slot)
//  - ad hoc raw markup (e.g. cron-status's job cards): a `.animate-pulse`
//    wrapper around plain `bg-muted` divs, no component, no marker attribute
// A bare `.animate-pulse` alone is NOT safe to match — the codebase also uses
// it standalone on persistent, non-loading UI (overdue badges, expiry
// warnings on security-contacts-table.tsx itself), so it's scoped here to the
// specific shape: a pulsing ancestor containing a muted skeleton-bar child.
// Missing any of the three means a capture can look complete while a
// placeholder grid is still showing — each one below was caught only by
// actually reviewing a capture, not by the checks catching themselves.
const LOADING_SELECTOR =
  '[data-slot="skeleton"], [aria-busy="true"], .animate-pulse [class*="bg-muted"], .animate-pulse[class*="bg-muted"]';

/**
 * Waits for the page to actually finish loading its data.
 *
 * A fixed sleep is not a readiness signal: the dashboard's queries regularly
 * outlast it and the capture then documents a grid of placeholders instead of
 * the real screen. Requires the loading markers to be absent across two checks
 * spaced apart, because some cards unmount one loading state only to mount a
 * second (e.g. an auth skeleton giving way to a data-fetch skeleton) — a
 * single zero-count reading can land in that gap and declare victory early.
 * Falls through to the settle time if a page legitimately never clears them.
 */
async function isClear(page) {
  const [markerCount, hasLoadingText] = await Promise.all([
    page.locator(LOADING_SELECTOR).count(),
    // A third pattern exists with no element marker at all — a bare
    // "Loading approvals..." string as a leaf node's entire content. Scoped
    // to a leaf so real content that merely mentions "loading" in passing
    // (which has sibling text or child elements) doesn't false-positive.
    page.evaluate(() => {
      const isLoadingLeaf = (el) =>
        el.children.length === 0 && /^loading\b.*\.\.\.$/i.test((el.textContent || '').trim());
      return Array.from(document.querySelectorAll('body *')).some(isLoadingLeaf);
    }),
  ]);
  return markerCount === 0 && !hasLoadingText;
}

async function waitForContent(page) {
  const deadline = Date.now() + navTimeout;
  let stable = false;
  while (Date.now() < deadline) {
    if (await isClear(page)) {
      await page.waitForTimeout(800);
      if (await isClear(page)) {
        stable = true;
        break;
      }
    }
    await page.waitForTimeout(500);
  }
  if (!stable) console.warn('  note: loading placeholders still present at timeout');

  await page.waitForTimeout(settleMs);
}

/**
 * Runs stabilize → mask → shoot, verifying clear both immediately before AND
 * after the shot, discarding and retrying the whole cycle if either check
 * fails. Some pages self-poll (cron-status refetches every 30s): a single
 * pre-shot check still leaves the gap between that check and the actual
 * screenshot call open to a React re-render landing right in it — checking
 * again after the shot is what actually closes that window, since a shot
 * taken during a flip would leave the page unclear immediately afterward too.
 * Bounded to 3 attempts so a page that never stabilizes still gets a capture.
 */
async function captureStable(page, { maskTable, maskNames } = {}, shoot) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForContent(page);
    await maskSensitiveContent(page, maskTable, maskNames);
    if (await isClear(page)) {
      await shoot();
      if (await isClear(page)) return;
    }
    console.warn(`  note: page reloaded right before or during capture — retrying (${attempt}/3)`);
  }
  console.warn('  note: could not get a stable capture after retries — capturing anyway');
  await shoot();
}

async function maskSensitiveContent(page, maskTable = false, maskNames = false) {
  await page.evaluate(({ shouldMaskTable, shouldMaskNames }) => {
    const replace = (value) => value
      .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, 'admin@example.com')
      .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '000 000 0000')
      .replace(/₦\s?[\d,]+(?:\.\d+)?/g, '₦0')
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '00000000-0000-0000-0000-000000000000')
      .replace(/\b\d{6}\b/g, '000000')
      .replace(/LEGACY-[A-Z0-9-]+/gi, 'SAMPLE-CONTACT')
      .replace(/\b[A-Z]{2,5}-\d+[A-Z0-9-]*\b/g, 'SAMPLE-HOUSE')
      .replace(/Super Administrator|Super/g, 'Admin');

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const value = replace(node.nodeValue || '');
      node.nodeValue = shouldMaskNames && /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/.test(value)
        ? 'Sample record'
        : value;
    });

    if (shouldMaskTable) {
      document.querySelectorAll('tbody tr').forEach((row) => {
        row.querySelectorAll('td').forEach((cell) => { cell.textContent = 'Sample record'; });
      });
    }

    if (shouldMaskNames) {
      document.querySelectorAll('main h1').forEach((heading) => { heading.textContent = 'Sample resident'; });
    }

    document.querySelectorAll('nextjs-portal').forEach((element) => element.remove());
    document.querySelectorAll('button').forEach((button) => {
      if ((button.textContent || '').includes('Next.js')) button.remove();
    });

    // The estate assistant floats over the bottom-right of every page and
    // obscures real content in a screenshot. Removed rather than dismissed via
    // its close control, which only minimises the panel and leaves the pill.
    document.querySelectorAll('div.fixed.bottom-6.right-6').forEach((element) => element.remove());

    document.querySelectorAll('input').forEach((input) => {
      if (input.value) input.value = replace(input.value);
    });
  }, { shouldMaskTable: maskTable, shouldMaskNames: maskNames });
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
// An explicit context, not browser.newPage()'s implicit default one — the
// default context refuses to spawn sibling pages via context.newPage(),
// which freshPage() below needs.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.setDefaultNavigationTimeout(navTimeout);

/**
 * A capture that times out mid-navigation can leave the shared page in an
 * indeterminate state — this is exactly what happened when an /approvals
 * timeout caused the *next* capture (settings-overview) to screenshot a
 * stale /dashboard render instead of /settings. A fresh page per capture,
 * sharing the authenticated context so login carries over, isolates each
 * capture from whatever the previous one left behind.
 */
async function freshPage() {
  const p = await context.newPage();
  p.setDefaultNavigationTimeout(navTimeout);
  await p.setViewportSize({ width: 1440, height: 900 });
  return p;
}

const failures = [];

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });

  // One slow or broken route should not discard the whole run. Failures are
  // collected and reported at the end so the rest of the set still lands.
  for (const capture of captures.filter((c) => wanted(c.file))) {
    const file = path.join(outputDir, capture.file);
    console.log(`Capturing ${capture.file} from ${capture.route}`);

    const capturePage = await freshPage();
    try {
      await capturePage.goto(`${baseUrl}${capture.route}`, { waitUntil: 'domcontentloaded' });

      if (capture.selector) {
        const element = capturePage.locator(capture.selector).first();
        // The nav rail selector doesn't depend on data readiness, so a plain
        // stabilize + mask is enough — no self-polling widget lives in <aside>.
        await waitForContent(capturePage);
        await maskSensitiveContent(capturePage, capture.maskTable);
        if (!(await element.count())) {
          console.warn(`  skipped: no element matching "${capture.selector}"`);
          failures.push(`${capture.file} (selector not found)`);
          continue;
        }
        // Locator screenshots are element-scoped; `fullPage` is a page-only option.
        await element.screenshot({ path: file });
      } else {
        await captureStable(capturePage, { maskTable: capture.maskTable }, () =>
          capturePage.screenshot({ path: file, fullPage: false }),
        );
      }
    } catch (error) {
      console.warn(`  failed: ${error.message.split('\n')[0]}`);
      failures.push(`${capture.file} (${capture.route})`);
    } finally {
      await capturePage.close();
    }
  }

  // These two need bespoke navigation, so they sit outside the captures loop —
  // but they must still respect `--only`, or a targeted run silently rewrites
  // them with whatever the database happens to hold today.
  if (wanted('resident-detail.png')) {
    const p = await freshPage();
    try {
      await p.goto(`${baseUrl}/residents`, { waitUntil: 'domcontentloaded' });
      await waitForContent(p);
      const firstResident = p.getByRole('row').nth(1);
      await p.waitForFunction(() => {
        const row = document.querySelector('tbody tr');
        return Boolean(row && (row.textContent || '').trim().length > 20 && !(row.textContent || '').includes('Loading'));
      }, undefined, { timeout: navTimeout });
      if (await firstResident.count()) {
        console.log('Capturing resident-detail.png from /residents');
        await firstResident.click();
        // Explicit waits take their own timeout; the page default does not apply.
        await p.waitForURL(/\/residents\/[^/]+$/, { timeout: navTimeout });
        await captureStable(p, { maskNames: true }, () =>
          p.screenshot({ path: path.join(outputDir, 'resident-detail.png'), fullPage: false }),
        );
      }
    } catch (error) {
      console.warn(`  failed: ${error.message.split('\n')[0]}`);
      failures.push('resident-detail.png (/residents)');
    } finally {
      await p.close();
    }
  }

  if (wanted('dashboard-mobile.png')) {
    const p = await page.context().newPage();
    p.setDefaultNavigationTimeout(navTimeout);
    try {
      console.log('Capturing dashboard-mobile.png from /dashboard');
      await p.setViewportSize({ width: 390, height: 844 });
      await p.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
      await captureStable(p, {}, () =>
        p.screenshot({ path: path.join(outputDir, 'dashboard-mobile.png'), fullPage: false }),
      );
    } catch (error) {
      console.warn(`  failed: ${error.message.split('\n')[0]}`);
      failures.push('dashboard-mobile.png (/dashboard)');
    } finally {
      await p.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} capture(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nThose images were left untouched. Re-run with --only to retry just them.');
  process.exit(1);
}

console.log('\nAll requested captures completed.');
