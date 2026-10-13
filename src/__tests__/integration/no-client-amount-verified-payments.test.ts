/**
 * Regression guard for #476: the placeholder verifyPaystackPayment inserted a
 * payment_records row with is_verified: true and a caller-supplied amount, and
 * credited the wallet, with no permission check. This scan keeps that shape out
 * of src/actions: an exported action that takes an amount from its params and
 * inserts a verified payment_records row must call authorizePermission().
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const ACTIONS_DIR = path.join(process.cwd(), 'src/actions');

interface ExportedFn {
  name: string;
  signature: string;
  body: string;
}

/** Splits a source file into its exported (async) functions, by header position. */
function exportedFunctions(source: string): ExportedFn[] {
  const header = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  const starts: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = header.exec(source))) starts.push({ name: m[1], index: m.index });
  return starts.map((s, i) => {
    const text = source.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : undefined);
    const open = Math.max(text.indexOf('{', text.indexOf(')')), 0);
    return { name: s.name, signature: text.slice(0, open), body: text.slice(open) };
  });
}

/** Names of exported functions that mint a verified payment from a caller amount unguarded. */
function findUnguardedVerifiedPayments(source: string): string[] {
  return exportedFunctions(source)
    .filter(
      (fn) =>
        /\bamount\b/.test(fn.signature) &&
        /\.from\(\s*['"]payment_records['"]\s*\)/.test(fn.body) &&
        /\.insert\(/.test(fn.body) &&
        /is_verified:\s*true/.test(fn.body) &&
        !/authorizePermission\(/.test(fn.body)
    )
    .map((fn) => fn.name);
}

function actionFiles(): string[] {
  return glob.sync('**/*.ts', { cwd: ACTIONS_DIR, absolute: true });
}

describe('#476 placeholder Paystack verifier is gone', () => {
  it('has no src/actions/payments/verify-paystack-payment.ts', () => {
    expect(fs.existsSync(path.join(ACTIONS_DIR, 'payments/verify-paystack-payment.ts'))).toBe(false);
  });

  it('exports no verifyPaystackPayment that takes an amount', () => {
    const offenders = actionFiles().flatMap((f) =>
      exportedFunctions(fs.readFileSync(f, 'utf-8'))
        .filter((fn) => fn.name === 'verifyPaystackPayment' && /\bamount\b/.test(fn.signature))
        .map(() => path.relative(ACTIONS_DIR, f))
    );
    expect(offenders).toEqual([]);
  });

  it('no action inserts a verified payment_records row from a caller amount without a permission check', () => {
    const offenders = actionFiles().flatMap((f) =>
      findUnguardedVerifiedPayments(fs.readFileSync(f, 'utf-8')).map(
        (n) => `${path.relative(ACTIONS_DIR, f)}:${n}`
      )
    );
    expect(offenders).toEqual([]);
  });

  it('the scan can fail: flags the removed placeholder shape, ignores a guarded one', () => {
    const bad = `export async function pay(params: { amount: number }) {
      await supabase.from('payment_records').insert({ amount: params.amount, is_verified: true });
    }`;
    const guarded = `export async function pay(params: { amount: number }) {
      const auth = await authorizePermission(P.X);
      await supabase.from('payment_records').insert({ amount: params.amount, is_verified: true });
    }`;
    expect(findUnguardedVerifiedPayments(bad)).toEqual(['pay']);
    expect(findUnguardedVerifiedPayments(guarded)).toEqual([]);
  });
});
