import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The email-only debug switch ("log and skip") was retired in favour of Debug Mode
 * (#717). Its setting rows stay in the database, marked deprecated, but nothing
 * may read them: a reader would silently skip sends instead of redirecting them.
 */
const srcDir = fileURLToPath(new URL('../../..', import.meta.url));
const LEGACY_KEYS = ['email_debug_mode', 'email_debug_recipient'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function isTestFile(file: string): boolean {
  const r = path.relative(srcDir, file).split(path.sep).join('/');
  return r.includes('__tests__/') || /\.test\.tsx?$/.test(r);
}

describe('legacy email debug settings', () => {
  it.each(LEGACY_KEYS)('nothing under src reads %s', (key) => {
    const offenders = walk(srcDir)
      .filter((file) => !isTestFile(file))
      .filter((file) => readFileSync(file, 'utf8').includes(key))
      .map((file) => path.relative(srcDir, file).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
