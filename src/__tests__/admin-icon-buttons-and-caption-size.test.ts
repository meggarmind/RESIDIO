// Issue #745: icon-only buttons need an accessible name, captions stay at 12px or
// larger, and thick coloured side borders stay out of the admin UI.
// Static source check: reads the files as text, no rendering, no network.
// The resident portal and src/components/ui are out of scope (CORE.md section 3).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [join(ROOT, 'src', 'components'), join(ROOT, 'src', 'app', '(dashboard)')];
const SKIP_DIRS = new Set(['__tests__', 'resident-portal', 'ui']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(join(dir, entry.name));
    return entry.name.endsWith('.tsx') ? [join(dir, entry.name)] : [];
  });
}

const FILES = SCAN_DIRS.flatMap(walk);
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => relative(ROOT, file).replace(/\\/g, '/');
const lineOf = (source: string, index: number) => source.slice(0, index).split(/\r?\n/).length;

// Returns the end index (exclusive) of a JSX opening tag that starts at `start`,
// skipping `>` inside braces and quotes (for example the arrow in `onClick={() => x}`).
function openingTagEnd(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i + 1;
  }
  return -1;
}

interface IconButton {
  line: number;
  named: boolean;
}

function iconButtons(source: string): IconButton[] {
  const found: IconButton[] = [];
  const startRe = /<Button\b/g;
  let match: RegExpExecArray | null;
  while ((match = startRe.exec(source))) {
    const end = openingTagEnd(source, match.index);
    if (end < 0) continue;
    const opening = source.slice(match.index, end);
    if (!/size=(?:"icon[^"]*"|\{\s*['"]icon)/.test(opening)) continue;
    const selfClosing = opening.trimEnd().endsWith('/>');
    const close = selfClosing ? end : source.indexOf('</Button>', end);
    const body = selfClosing || close < 0 ? '' : source.slice(end, close);
    const textChild = body
      .replace(/<[^>]*>/g, '>')
      .replace(/\{[^}]*\}/g, '')
      .match(/>\s*[A-Za-z]/);
    const named =
      /aria-label|aria-labelledby|title=/.test(opening) || /sr-only|aria-label/.test(body) || Boolean(textChild);
    found.push({ line: lineOf(source, match.index), named });
  }
  return found;
}

describe('admin UI accessibility and legibility (#745)', () => {
  it('scans a realistic number of files', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });

  it('every icon-only Button has an accessible name', () => {
    const offences: string[] = [];
    let total = 0;
    for (const file of FILES) {
      const buttons = iconButtons(read(file));
      total += buttons.length;
      for (const b of buttons) if (!b.named) offences.push(`${rel(file)}:${b.line}`);
    }
    expect(total, 'the parser must find the icon buttons').toBeGreaterThan(80);
    expect(
      offences,
      `Add an aria-label (name the action and, where in scope, the row):\n${offences.join('\n')}`
    ).toEqual([]);
  });

  it('no 10px or 11px text classes', () => {
    const offences: string[] = [];
    for (const file of FILES) {
      read(file)
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/text-\[1[01]px\]/.test(line)) offences.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offences, `Use text-xs (12px) instead:\n${offences.join('\n')}`).toEqual([]);
  });

  it('no thick coloured side-tab borders', () => {
    const offences: string[] = [];
    for (const file of FILES) {
      read(file)
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (/\bborder-[lr]-4\b/.test(line)) offences.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offences, `Use a tinted background or a badge instead:\n${offences.join('\n')}`).toEqual([]);
  });
});
