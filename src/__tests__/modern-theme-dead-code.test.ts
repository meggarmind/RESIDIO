// Issue #746: the dead `isModern` branches and the unused `modern` Button and
// Input variants stay deleted, and the billing, payments and security pages
// carry no theme-blind hex or colour-function literals.
// Static source check: reads the files as text, no rendering, no network.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const DEAD_BRANCH_FILES = [
  'src/app/(dashboard)/billing/page.tsx',
  'src/components/billing/statement-generator-dialog.tsx',
  'src/components/billing/generation-history-panel.tsx',
  'src/app/(dashboard)/billing/generate/page.tsx',
  'src/app/(dashboard)/payments/page.tsx',
  'src/app/(dashboard)/security/page.tsx',
];
const COLOUR_FILES = [...DEAD_BRANCH_FILES, 'src/components/security/security-contacts-table.tsx'];

const HEX_COLOUR_CLASS = /(bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/;
// Colour-function literals (hsl(...), rgb(...)) are theme-blind too.
const COLOUR_FUNCTION = /\b(hsl|rgb)a?\(\s*\d/;
const MODERN_VARIANT_KEY = /["']?modern[a-z-]*["']?\s*:/;

function findOffences(file: string, pattern: RegExp): string[] {
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (pattern.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
  });
  return hits;
}

describe('modern theme dead code (#746)', () => {
  it.each(DEAD_BRANCH_FILES)('%s has no isModern branches', (file) => {
    const hits = findOffences(file, /isModern/);
    expect(hits, `isModern must stay deleted:\n${hits.join('\n')}`).toEqual([]);
  });

  it.each(DEAD_BRANCH_FILES)('%s does not read the visual theme', (file) => {
    const hits = findOffences(file, /useVisualTheme/);
    expect(hits, `useVisualTheme must stay removed:\n${hits.join('\n')}`).toEqual([]);
  });

  it.each(COLOUR_FILES)('%s has no arbitrary-hex colour classes', (file) => {
    const hits = findOffences(file, HEX_COLOUR_CLASS);
    expect(
      hits,
      `Use theme tokens (bg-card, border-border, text-primary, ...) instead of hex:\n${hits.join('\n')}`
    ).toEqual([]);
  });

  it.each(COLOUR_FILES)('%s has no hsl()/rgb() colour literals', (file) => {
    const hits = findOffences(file, COLOUR_FUNCTION);
    expect(
      hits,
      `Use a CSS variable such as var(--primary) instead of a colour literal:\n${hits.join('\n')}`
    ).toEqual([]);
  });

  it('button.tsx defines no modern variant', () => {
    const hits = findOffences('src/components/ui/button.tsx', MODERN_VARIANT_KEY);
    expect(hits, `Unused modern Button variants must stay deleted:\n${hits.join('\n')}`).toEqual([]);
  });

  it('input.tsx has no modern variant', () => {
    const hits = findOffences('src/components/ui/input.tsx', /modern/i);
    expect(hits, `The unused modern Input variant must stay deleted:\n${hits.join('\n')}`).toEqual([]);
  });
});
