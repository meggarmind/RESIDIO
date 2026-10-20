// Issue #788: every settings file that can write must gate its controls on a
// permission (CORE.md section 6: gate on the action, not the page).
// Static source check: reads the files as text, no rendering, no network.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SETTINGS_DIR = join(ROOT, 'src', 'app', '(dashboard)', 'settings');

/** Shared components the settings pages render their write controls through. */
const SHARED_COMPONENTS = [
  'src/components/admin/streets-list.tsx',
  'src/components/admin/house-types-list.tsx',
  'src/components/admin/bank-accounts-list.tsx',
  'src/components/admin/transaction-tags-list.tsx',
  'src/components/admin/roles-list.tsx',
  'src/components/admin/bank-passwords-section.tsx',
  'src/components/notifications/schedule-list.tsx',
  'src/components/notifications/template-list.tsx',
];

/**
 * Files that write without a gate of their own, each with its reason. Keep it short:
 * an entry here is a page whose controls a narrower role would see and fail on.
 */
const ALLOWLIST: Record<string, string> = {};

const WRITES =
  /\.mutate(Async)?\(|useMutation\(|\bawait (create|update|delete|set|save|remove|reset|toggle|add|import|promote|disconnect|prune|upload|send|test|approve|reject)[A-Z]\w*\(/;
const GATE = /\bhas(Any)?Permission\(|\buseCan\(|<Can\b/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [relative(ROOT, full)] : [];
  });
}

const files = [...walk(SETTINGS_DIR), ...SHARED_COMPONENTS];

function ungatedWriters(paths: string[], read: (p: string) => string): string[] {
  return paths.filter((p) => {
    const src = read(p);
    return WRITES.test(src) && !GATE.test(src) && !(p in ALLOWLIST);
  });
}

describe('settings write gating (#788)', () => {
  it('finds the settings files that write', () => {
    // Guards the scan itself: an empty match set would make the next test pass vacuously.
    const writers = files.filter((p) => WRITES.test(readFileSync(join(ROOT, p), 'utf8')));
    expect(writers.length).toBeGreaterThan(25);
  });

  it('every file that writes also checks a permission, or is allowlisted with a reason', () => {
    const offenders = ungatedWriters(files, (p) => readFileSync(join(ROOT, p), 'utf8'));
    expect(
      offenders,
      `Gate each write control on the permission its server action enforces:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('flags a writer that has no gate', () => {
    const fake = { 'x.tsx': "const m = useUpdateThing(); m.mutate({});" };
    expect(ungatedWriters(['x.tsx'], (p) => fake[p as keyof typeof fake])).toEqual(['x.tsx']);
  });
});
