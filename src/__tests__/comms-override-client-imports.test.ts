import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Client components must not reach server-only code (#717): the Next build fails
 * with "You're importing a module that depends on next/headers". Walks the import
 * graph from each client page and asserts the closure holds no server-only file.
 *
 * Imports of a 'use server' file are a boundary (the client receives an RPC stub,
 * not the module), so the walk records them but does not follow them. Type-only
 * imports are erased at compile time and are skipped.
 */
const srcDir = fileURLToPath(new URL('..', import.meta.url));

const ENTRY_POINTS = [
  'app/(dashboard)/settings/comms-override/page.tsx',
  'app/(dashboard)/settings/email/debug/page.tsx',
];

const FORBIDDEN = ['lib/supabase/server.ts', 'lib/settings/service.ts', 'lib/comms-override/settings.ts'];

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(srcDir, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const rel = (file: string) => path.relative(srcDir, file).split(path.sep).join('/');

function closure(entry: string): { files: Set<string>; offenders: string[] } {
  const files = new Set<string>();
  const offenders: string[] = [];
  const queue = [path.join(srcDir, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    if (FORBIDDEN.includes(rel(file)) || /['"]next\/headers['"]/.test(source)) offenders.push(rel(file));
    // A 'use server' module is an RPC boundary: do not follow what it imports.
    if (/^\s*['"]use server['"]/.test(source)) continue;
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(match[1] ?? match[2], file);
      if (resolved) queue.push(resolved);
    }
  }
  return { files, offenders };
}

describe.each(ENTRY_POINTS)('client page %s', (entry) => {
  const { files, offenders } = closure(entry);

  it('actually walks its imports (guards against a broken matcher)', () => {
    expect(files.size).toBeGreaterThan(5);
    expect([...files].map(rel)).toContain('components/ui/button.tsx');
  });

  it('never reaches server-only code', () => {
    expect(offenders).toEqual([]);
  });
});

describe('comms override client page', () => {
  it('uses the pure limits module, not the server-backed settings loader', () => {
    const { files } = closure(ENTRY_POINTS[0]);
    const names = [...files].map(rel);
    expect(names).toContain('lib/comms-override/limits.ts');
    expect(names).not.toContain('lib/comms-override/settings.ts');
  });
});
