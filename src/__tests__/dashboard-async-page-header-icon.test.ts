import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Structural test: no async Server Component under src/app/(dashboard)/**
 * may pass a component-valued `icon=` prop to `EnhancedPageHeader`.
 *
 * `EnhancedPageHeader` (src/components/dashboard/enhanced-stat-card.tsx) is
 * `'use client'` -- it calls `useVisualTheme()`. A lucide icon such as
 * `CreditCard` is a `forwardRef` object holding a `render` function, which
 * React cannot serialize across the RSC boundary. An `async function` page
 * component is a Server Component by definition, so if one renders
 * `<EnhancedPageHeader icon={SomeIcon} />` directly, the page is replaced at
 * runtime by the error boundary with:
 *
 *   "Functions cannot be passed directly to Client Components unless you
 *   explicitly expose it by marking it with "use server"."
 *
 * This bit /payments/new (issue #105): the page must stay async to await
 * `searchParams`, so the fix moves the icon import and the
 * `EnhancedPageHeader` render into a small co-located 'use client' component
 * that the server page renders with no icon prop crossing the boundary.
 *
 * The test walks the real dashboard route tree rather than hard-coding one
 * file, so it also catches the next page that reintroduces the pattern.
 */

const DASHBOARD_APP_DIR = path.join(process.cwd(), 'src', 'app', '(dashboard)');

function listTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsxFiles(fullPath));
    } else if (entry.isFile() && /\.tsx$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * True if `source` renders `<EnhancedPageHeader ... icon={...} ... />` --
 * i.e. an `icon={` attribute appears within a single EnhancedPageHeader JSX
 * open tag, not merely somewhere later in the file.
 */
function rendersEnhancedPageHeaderWithIconProp(source: string): boolean {
  const tagRegex = /<EnhancedPageHeader\b[\s\S]*?(?:\/>|>)/g;
  const tags = source.match(tagRegex) ?? [];
  return tags.some((tag) => /\bicon=\{/.test(tag));
}

function isAsyncServerComponentPage(source: string): boolean {
  return /export\s+default\s+async\s+function\b/.test(source);
}

function importsEnhancedPageHeader(source: string): boolean {
  return /import\s*\{[^}]*\bEnhancedPageHeader\b[^}]*\}\s*from\s*['"]@\/components\/dashboard\/enhanced-stat-card['"]/.test(
    source
  );
}

describe('async dashboard pages never pass an icon component to EnhancedPageHeader', () => {
  it('finds no async Server Component rendering <EnhancedPageHeader icon={...} />', () => {
    const files = listTsxFiles(DASHBOARD_APP_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');

      if (!isAsyncServerComponentPage(source)) continue;
      if (!importsEnhancedPageHeader(source)) continue;
      if (!rendersEnhancedPageHeaderWithIconProp(source)) continue;

      offenders.push(path.relative(process.cwd(), file));
    }

    expect(
      offenders,
      `these async Server Components pass a non-serializable icon prop directly ` +
        `to the client-only EnhancedPageHeader, which crashes with "Functions ` +
        `cannot be passed directly to Client Components": ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
