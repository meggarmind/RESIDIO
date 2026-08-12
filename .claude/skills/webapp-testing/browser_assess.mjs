import { chromium } from '@playwright/test';


const BASE = "http://localhost:3000";
const results = { console_errors: [], console_warnings: [], visual_issues: [], screenshots: [] };

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error") {
        results.console_errors.push(`[${t}] ${msg.text()}`);
      } else if (t === "warning") {
        results.console_warnings.push(`[${t}] ${msg.text()}`);
      }
      // Capture all log types for debugging
      if (t === "log") {
        const txt = msg.text();
        if (txt.includes("error") || txt.includes("Error") || txt.includes("fail") || txt.includes("Fail") || txt.includes("supabase") || txt.includes("fetch")) {
          results.console_errors.push(`[log] ${txt}`);
        }
      }
    });
    page.on("pageerror", (err) => results.console_errors.push(`[pageerror] ${err.message}`));

    // 1. Login
    console.log(">>> Logging in...");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await page.fill('input[name="email"]', "admin@residio.test");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 30000 });
    console.log(">>> Login successful!");

    // 2. Navigate to residents list
    console.log(">>> Navigating to /residents...");
    await page.goto(`${BASE}/residents`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. Navigate to first resident
    console.log(">>> Looking for first resident...");
    await page.screenshot({ path: "C:/Users/ohiom/AppData/Local/Temp/opencode/debug_residents_list.png", fullPage: true });
    console.log(">>> URL:", page.url(), "Table rows:", await page.locator('table tbody tr').count());
    
    // Try extracting resident IDs from rendered HTML first
    let residentId = await page.evaluate(() => {
      // Look for data attributes or hrefs
      const links = document.querySelectorAll('a[href*="/residents/"]');
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/residents\/([a-f0-9-]{36})/);
        if (m) return m[1];
      }
      // Try table row data attributes
      const rows = document.querySelectorAll('table tbody tr[data-resident-id]');
      if (rows.length > 0) return rows[0].getAttribute('data-resident-id');
      return null;
    });
    console.log(">>> Extracted resident ID from DOM:", residentId);

    let residentUrl = null;
    if (residentId) {
      residentUrl = `${BASE}/residents/${residentId}`;
    } else {
      // Fallback: try clicking the table row with more robust approach
      console.log(">>> Attempting row click navigation...");
      const firstRow = page.locator('table tbody tr').first();
      const rowCount = await firstRow.count();
      if (rowCount > 0) {
        // Check if row has a click handler by evaluating
        const clicked = await page.evaluate(() => {
          const row = document.querySelector('table tbody tr');
          if (row) {
            row.click();
            return true;
          }
          return false;
        });
        console.log(">>> Row click dispatched:", clicked);
        await page.waitForTimeout(3000);
        console.log(">>> After click URL:", page.url());
        if (page.url().includes('/residents/') && page.url().split('/residents/')[1].length > 0) {
          residentUrl = page.url();
        }
      }
    }

    if (!residentUrl) {
      // Direct navigation: try to extract from page HTML
      console.log(">>> Trying direct navigation from rendered data...");
      const idFromCell = await page.evaluate(() => {
        // Look for resident_code in table cells (matches pattern like R-xxxx)
        const cells = document.querySelectorAll('table td');
        for (const td of cells) {
          const text = td.textContent?.trim() || '';
          // If we find a font-mono cell, try to extract from nearby links or the row click
          if (td.className.includes('font-mono')) {
            // Get the parent row and try click
            const row = td.closest('tr');
            if (row) {
              // Try to find any hidden ID or use the row index
              row.click();
              return text; // return the code for debugging
            }
          }
        }
        return null;
      });
      console.log(">>> Found resident code:", idFromCell);
      await page.waitForTimeout(3000);
      console.log(">>> After click URL:", page.url());
      if (page.url().includes('/residents/') && page.url().split('/residents/')[1].length > 0) {
        residentUrl = page.url();
      }
    }

    if (!residentUrl) {
      // Last resort: fetch the resident list from the network
      const content = await page.content();
      const match = content.match(/\/residents\/([a-f0-9-]{36})/);
      if (match) residentUrl = `${BASE}/residents/${match[1]}`;
    }

    if (residentUrl) {
      console.log(`>>> Navigating to ${residentUrl}...`);
      await page.goto(residentUrl, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log(`>>> On resident detail page: ${page.url()}`);
    }

    if (!residentUrl) {
      console.log(">>> WARNING: Could not find a resident URL.");
      await page.screenshot({ path: "C:/Users/ohiom/AppData/Local/Temp/opencode/screenshot_desktop.png", fullPage: true });
      results.screenshots.push("desktop_residents_list");
      results.visual_issues.push("Could not navigate to resident detail - no resident IDs found");
    } else {
      console.log(`>>> Running visual checks on: ${residentUrl}`);

      // Desktop screenshot
      await page.screenshot({ path: "C:/Users/ohiom/AppData/Local/Temp/opencode/screenshot_desktop.png", fullPage: true });
      results.screenshots.push("desktop_detail");

      // Mobile screenshot
      const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const mobilePage = await mobileCtx.newPage();
      await mobilePage.goto(residentUrl, { waitUntil: "networkidle", timeout: 30000 });
      await mobilePage.waitForTimeout(3000);
      await mobilePage.screenshot({ path: "C:/Users/ohiom/AppData/Local/Temp/opencode/screenshot_mobile.png", fullPage: true });
      results.screenshots.push("mobile_detail");
      await mobileCtx.close();

      // Visual checks
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(500);
      const bodyWidth = await page.evaluate("document.body.scrollWidth");
      const viewportWidth = await page.evaluate("window.innerWidth");
      if (bodyWidth > viewportWidth) {
        results.visual_issues.push(`Horizontal overflow: body=${bodyWidth}px > viewport=${viewportWidth}px`);
      }

      // Small tap targets
      const smallTargets = await page.evaluate(() => {
        const issues = [];
        const interactions = document.querySelectorAll('button, a, input, select, textarea');
        interactions.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
            issues.push(`Small tap target: ${el.tagName.toLowerCase()} (${Math.round(rect.width)}x${Math.round(rect.height)}px) - "${el.textContent?.trim().substring(0, 20) || ''}"`);
          }
        });
        return issues;
      });
      results.visual_issues.push(...smallTargets.slice(0, 5));

      // Small text
      const smallText = await page.evaluate(() => {
        const issues = [];
        const all = document.querySelectorAll('*');
        all.forEach((el) => {
          if (el.children.length > 0) return;
          const style = window.getComputedStyle(el);
          const fontSize = parseFloat(style.fontSize);
          if (fontSize > 0 && fontSize < 10) {
            issues.push(`Small text (${Math.round(fontSize)}px): "${el.textContent.trim().substring(0, 30)}"`);
          }
        });
        return issues.slice(0, 5);
      });
      results.visual_issues.push(...smallText);

      // Truncated text
      const truncation = await page.evaluate(() => {
        const issues = [];
        const all = document.querySelectorAll('*');
        all.forEach((el) => {
          const style = window.getComputedStyle(el);
          if (style.textOverflow === 'ellipsis' && style.overflow === 'hidden' && el.scrollWidth > el.clientWidth) {
            issues.push(`Truncated: "${el.textContent.trim().substring(0, 40)}"`);
          }
        });
        return issues.slice(0, 5);
      });
      results.visual_issues.push(...truncation);
    }
  } finally {
    await browser.close();
  }

  console.log("___JSON_START___");
  console.log(JSON.stringify(results, null, 2));
  console.log("___JSON_END___");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  console.log("___JSON_START___");
  console.log(JSON.stringify({ error: e.message, ...results }, null, 2));
  console.log("___JSON_END___");
  process.exit(1);
});
