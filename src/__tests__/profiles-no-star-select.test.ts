import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #455: migration 20261012210000 revokes SELECT on profiles.two_factor_secret_encrypted
 * from anon and authenticated. A USER-session client that reads profiles with `*`
 * (select('*'), select(), select(`*, ...`), a `profiles(*)` embed, or a
 * .insert()/.update() followed by an empty .select()) therefore gets "permission
 * denied" -- and for head/count queries the error is easy to swallow, which turns
 * guards like "role still has users" into silent no-ops.
 *
 * This scans src/ (non-test) for those shapes. A call is exempt only when its
 * client is provably the admin client: either the receiver is named like one, or
 * the receiver is a `const x = createAdminClient()` in the same file.
 *
 * Limits: string-literal table names only (a variable holding 'profiles' is not
 * seen), and the receiver must be a plain identifier or createAdminClient().
 */

const SRC = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) && !entry.name.endsWith('.generated.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Parse a balanced "(...)" starting at `open`; returns [args, indexAfterClose]. */
function parseParens(src: string, open: number): [string, number] | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return [src.slice(open + 1, i), i + 1];
  }
  return null;
}

/** The `.method(args)` chain following position `pos`. */
function chainAfter(src: string, pos: number): { method: string; args: string }[] {
  const calls: { method: string; args: string }[] = [];
  let i = pos;
  for (;;) {
    const m = /^\s*\.\s*([A-Za-z_]\w*)\s*\(/.exec(src.slice(i));
    if (!m) break;
    const open = i + m[0].length - 1;
    const parsed = parseParens(src, open);
    if (!parsed) break;
    calls.push({ method: m[1], args: parsed[0] });
    i = parsed[1];
  }
  return calls;
}

function isAdminReceiver(src: string, before: string): boolean {
  const recv = /([A-Za-z_]\w*(?:\(\))?)\s*$/.exec(before.replace(/\s+$/, ''))?.[1] ?? '';
  if (/admin|service/i.test(recv)) return true;
  const name = recv.replace(/\(\)$/, '');
  const decl = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*(?:await\\s+)?([^;\\n]+)`, 'g');
  let isAdmin = false;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(src))) if (/createAdminClient/.test(m[1])) isAdmin = true;
  return isAdmin;
}

const emptyOrStar = (args: string) => {
  const t = args.trim();
  return t === '' || /^[`'"]\s*\*/.test(t);
};

export function findViolations(file: string, src: string): string[] {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  const found: string[] = [];
  const line = (idx: number) => src.slice(0, idx).split('\n').length;

  const fromRe = /\.from\(\s*['"]profiles['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(src))) {
    const calls = chainAfter(src, m.index + m[0].length);
    const bad = calls.find((c) => c.method === 'select' && emptyOrStar(c.args));
    if (bad && !isAdminReceiver(src, src.slice(0, m.index))) {
      found.push(`${rel}:${line(m.index)} profiles .select(${bad.args.trim().slice(0, 30)}) on a user client`);
    }
  }

  // `profiles(*)` / `alias:profiles!fk(*)` embeds, from any table.
  const embedRe = /profiles(?:![\w]+)?\(\s*\*/g;
  while ((m = embedRe.exec(src))) {
    const fromIdx = src.lastIndexOf('.from(', m.index);
    if (fromIdx === -1 || !isAdminReceiver(src, src.slice(0, fromIdx))) {
      found.push(`${rel}:${line(m.index)} profiles(*) embed on a user client`);
    }
  }
  return found;
}

describe('no `*` reads of profiles through a user-session client (#455)', () => {
  it('src/ has none', () => {
    const violations = walk(SRC).flatMap((f) => findViolations(f, fs.readFileSync(f, 'utf8')));
    expect(violations).toEqual([]);
  });

  it('the scanner itself flags each unsafe shape and spares admin clients', () => {
    const f = path.join(SRC, 'x.ts');
    const flagged = (code: string) => findViolations(f, code).length;

    expect(flagged(`await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('a', 1)`)).toBe(1);
    expect(flagged(`await supabase.from('profiles').select().eq('a', 1)`)).toBe(1);
    expect(flagged('await supabase.from("profiles").select(`*, app_roles(name)`)')).toBe(1);
    expect(flagged(`await supabase.from('profiles').update({a:1}).eq('id', 1).select().single()`)).toBe(1);
    expect(flagged(`await supabase.from('profiles').insert({a:1}).select('*').single()`)).toBe(1);
    expect(flagged(`await supabase.from('audit_logs').select('*, actor:profiles(*)')`)).toBe(1);
    expect(flagged(`await supabase.from('x').select('a, p:profiles!fk(*)')`)).toBe(1);

    expect(flagged(`await supabase.from('profiles').select('id, full_name').eq('a', 1)`)).toBe(0);
    expect(flagged(`await supabase.from('profiles').update({a:1}).eq('id', 1).select('id').single()`)).toBe(0);
    expect(flagged(`await supabase.from('profiles').update({a:1}).eq('id', 1)`)).toBe(0);
    expect(flagged(`await adminClient.from('profiles').select('*')`)).toBe(0);
    expect(flagged(`const db = createAdminClient();\nawait db.from('profiles').select('*')`)).toBe(0);
    expect(flagged(`const db = createClient();\nawait db.from('profiles').select('*')`)).toBe(1);
  });
});
