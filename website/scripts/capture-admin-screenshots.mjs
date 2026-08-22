import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RESIDIO_BASE_URL ?? 'http://localhost:3000';
const email = process.env.RESIDIO_ADMIN_EMAIL;
const password = process.env.RESIDIO_ADMIN_PASSWORD;
const outputDir = path.resolve('docs/assets/admin');

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
];

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

    document.querySelectorAll('input').forEach((input) => {
      if (input.value) input.value = replace(input.value);
    });
  }, { shouldMaskTable: maskTable, shouldMaskNames: maskNames });
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });

  for (const capture of captures) {
    await page.goto(`${baseUrl}${capture.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10_000);
    await maskSensitiveContent(page, capture.maskTable);
    await page.screenshot({ path: path.join(outputDir, capture.file), fullPage: false });
  }

  await page.goto(`${baseUrl}/residents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10_000);
  const firstResident = page.getByRole('row').nth(1);
  await page.waitForFunction(() => {
    const row = document.querySelector('tbody tr');
    return Boolean(row && (row.textContent || '').trim().length > 20 && !(row.textContent || '').includes('Loading'));
  }, undefined, { timeout: 30_000 });
  if (await firstResident.count()) {
    await firstResident.click();
    await page.waitForURL(/\/residents\/[^/]+$/, { timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await maskSensitiveContent(page, false, true);
    await page.screenshot({ path: path.join(outputDir, 'resident-detail.png'), fullPage: false });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12_000);
  await maskSensitiveContent(page);
  await page.screenshot({ path: path.join(outputDir, 'dashboard-mobile.png'), fullPage: false });
} finally {
  await browser.close();
}
