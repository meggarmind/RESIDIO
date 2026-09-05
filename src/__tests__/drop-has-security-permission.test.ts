import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260905001000_drop_orphaned_has_security_permission.sql', import.meta.url),
  'utf8'
);

/**
 * Strip SQL line comments (--) and block comments to reveal executable statements.
 * Preserves newlines for line-number stability. Does not strip quotes
 * since we only care about the structure of the executable SQL here.
 */
function stripSqlComments(sql: string): string {
  const out: string[] = [];
  let i = 0;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) {
      out.push(sql[k] === '\n' ? '\n' : ' ');
    }
  };

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    out.push(sql[i]);
    i += 1;
  }

  return out.join('');
}

/**
 * Recursively find all .ts/.tsx files in a directory that contain a search string.
 * Excludes the test file itself. Returns sorted absolute paths.
 */
function findFilesContaining(dir: string, searchString: string, excludeFile?: string): string[] {
  const results: string[] = [];

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and other common exclusions
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        if (excludeFile && fullPath === excludeFile) {
          continue;
        }
        try {
          const content = readFileSync(fullPath, 'utf8');
          if (content.includes(searchString)) {
            results.push(fullPath);
          }
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  walk(dir);
  return results.sort();
}

describe('drop orphaned has_security_permission', () => {
  it('executable SQL contains only DROP FUNCTION and DELETE, not CREATE/INSERT', () => {
    const executable = stripSqlComments(migration);

    // Should contain the two executable statements
    expect(executable).toContain('DROP FUNCTION IF EXISTS public.has_security_permission(text);');
    expect(executable).toContain("DELETE FROM public.system_settings WHERE key = 'security_role_permissions';");

    // Should NOT contain CREATE/INSERT statements (which must stay in rollback comment)
    const cleanExecutable = executable.replace(/\s+/g, ' ').trim();
    expect(cleanExecutable).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(cleanExecutable).not.toContain('INSERT INTO public.system_settings');
  });

  it('includes a ROLLBACK comment block with the full function definition', () => {
    expect(migration).toContain('-- ROLLBACK:');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.has_security_permission(permission_name text)');
    expect(migration).toContain('RETURNS boolean');
    expect(migration).toContain('LANGUAGE plpgsql');
    expect(migration).toContain('STABLE SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'");
  });

  it('includes the INSERT statement to restore the settings row in the ROLLBACK block', () => {
    expect(migration).toContain("INSERT INTO public.system_settings (key, value, description, category)");
    expect(migration).toContain("'security_role_permissions'");
    expect(migration).toContain("'Role permissions for security module features'");
  });

  it('restores the hardened ACL in the ROLLBACK block', () => {
    // Verify the ACL statements are in the rollback comment block
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.has_security_permission(text) FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.has_security_permission(text) TO authenticated, service_role;');
    expect(migration).toContain('20260824201000');
    expect(migration).toContain('20260824202000');
  });

  it('has_security_permission is only referenced in generated type stubs', () => {
    const srcDir = fileURLToPath(new URL('../../src', import.meta.url));
    const thisTestFile = fileURLToPath(import.meta.url);
    const filesWithReference = findFilesContaining(srcDir, 'has_security_permission', thisTestFile);

    // Should only be in database.generated.ts
    const generatedTypeFile = path.join(srcDir, 'types', 'database.generated.ts');
    expect(filesWithReference).toEqual([generatedTypeFile]);
  });
});
