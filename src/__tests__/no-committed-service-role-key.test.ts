import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// Issue #454: a service_role JWT was committed inline in several scripts.
// This scan fails if any file under scripts/, src/ or public/ contains a
// JWT-shaped literal whose payload carries a service_role claim.

const ROOT = process.cwd();
const SCAN_DIRS = ['scripts', 'src', 'public'];
const SKIP_DIRS = new Set(['node_modules', '.next']);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|html|md|sql|sh|yml|yaml|txt)$/;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(name)) out.push(full);
  }
  return out;
}

function hasServiceRoleClaim(token: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
    );
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

describe('no committed service_role key (#454)', () => {
  it('detector recognises a service_role-shaped token', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const fake = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.sig`;
    const anon = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon' })}.sig`;
    expect(hasServiceRoleClaim(fake)).toBe(true);
    expect(hasServiceRoleClaim(anon)).toBe(false);
  });

  it('no file under scripts/, src/ or public/ embeds a service_role JWT', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      let files: string[] = [];
      try {
        files = walk(join(ROOT, dir));
      } catch {
        continue;
      }
      for (const file of files) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
          for (const m of line.match(JWT_RE) ?? []) {
            if (hasServiceRoleClaim(m)) {
              offenders.push(`${relative(ROOT, file)}:${i + 1}`);
            }
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
