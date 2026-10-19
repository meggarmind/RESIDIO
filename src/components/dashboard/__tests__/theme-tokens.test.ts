// Issue #743: dashboard components must follow the active theme tokens instead
// of hard-coded hex colours, and the dead `isModern` branches stay deleted.
// Static source check: reads the files as text, no rendering, no network.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src', 'components', 'dashboard');

const ALL_FILES = [
  'mobile-nav.tsx',
  'enhanced-stat-card.tsx',
  'modern-skeleton.tsx',
  'modern-empty-state.tsx',
];
const DEAD_BRANCH_FILES = ['mobile-nav.tsx', 'enhanced-stat-card.tsx'];

const HEX_COLOUR_CLASS = /(bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/;

// Colour-function literals (hsl(...), rgb(...)) are theme-blind too.
const COLOUR_FUNCTION = /\b(hsl|rgb)a?\(\s*\d/;

function findOffences(file: string, pattern: RegExp): string[] {
  const lines = readFileSync(join(DIR, file), 'utf8').split(/\r?\n/);
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (pattern.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
  });
  return hits;
}

describe('dashboard theme tokens (#743)', () => {
  it.each(DEAD_BRANCH_FILES)('%s has no isModern branches', (file) => {
    const hits = findOffences(file, /isModern/);
    expect(hits, `isModern must stay deleted:\n${hits.join('\n')}`).toEqual([]);
  });

  it.each(DEAD_BRANCH_FILES)('%s does not read the visual theme', (file) => {
    const hits = findOffences(file, /useVisualTheme/);
    expect(hits, `useVisualTheme must stay removed:\n${hits.join('\n')}`).toEqual([]);
  });

  it.each(ALL_FILES)('%s has no hsl()/rgb() colour literals', (file) => {
    const hits = findOffences(file, COLOUR_FUNCTION);
    expect(
      hits,
      `Use a CSS variable such as var(--primary) instead of a colour literal:\n${hits.join('\n')}`
    ).toEqual([]);
  });

  it.each(ALL_FILES)('%s has no arbitrary-hex colour classes', (file) => {
    const hits = findOffences(file, HEX_COLOUR_CLASS);
    expect(
      hits,
      `Use theme tokens (bg-card, border-border, text-primary, ...) instead of hex:\n${hits.join('\n')}`
    ).toEqual([]);
  });
});
