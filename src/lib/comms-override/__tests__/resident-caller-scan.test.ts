import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #716: every call to a send seam must say which resident it is for, so the per-resident flag reaches the
 * resolver, and the value must come from the resident's stored flag.
 *
 * A call site is valid when its arguments contain `residentOverride: X.residentOverride` where X is declared
 * in the same file from `resolveResidentOverride(...)` / `residentOverrideFrom(...)` (the lookup of
 * `residents.use_override_comms`). A hard-coded `false`, `null` or any other expression fails. The two files
 * that forward a caller's context (`FORWARDERS`) may forward `context` instead.
 *
 * The sanctioned non-resident callers are listed per FUNCTION with the number of call sites each may hold,
 * so a resident send added later to `send-admin-alert.ts` (or a second call in the same function) is flagged.
 * The value of each caller is also pinned behaviourally in the per-caller tests (a stored true / false / null
 * must reach the seam unchanged).
 *
 * Callers of `sendImmediate` and `addToQueue` are not scanned: both carry a resident id, and the flag is
 * looked up inside `sendImmediate` and `sendAndRecordNotification` (resident-flag-wiring.test.ts). Queue rows
 * keep the real recipient and the redirect happens at send time.
 *
 * Limitation: the scanner masks string literals and comments with a small tokenizer; an apostrophe in JSX
 * text could hide later code in a .tsx file. No seam caller is a .tsx file today.
 */
const srcDir = fileURLToPath(new URL('../../..', import.meta.url));

const SEAMS = [
  'sendEmail',
  'sendSms',
  'sendVerificationSms',
  'sendWhatsAppTemplate',
  'sendWhatsAppMessage',
  'sendNotification',
];

/** Files that forward a context their caller built, rather than looking the flag up themselves. */
const FORWARDERS = new Set(['lib/notifications/send.ts', 'lib/sms/send-sms.ts']);

interface Allowed {
  file: string;
  fn: string;
  /** Exactly this many seam calls may live in the function. */
  sites: number;
  /** The exempt purpose every call must carry, if any. */
  purpose?: 'self_auth_2fa' | 'inbound_reply';
  reason: string;
}

/** Sanctioned callers that pass no resident context, per function. */
const NO_RESIDENT_CONTEXT: Allowed[] = [
  { file: 'actions/email/send-admin-alert.ts', fn: 'sendAdminAlert', sites: 1, reason: 'recipients are staff (profiles.email): follow the global switch' },
  { file: 'actions/email/test-email.ts', fn: 'testEmail', sites: 1, reason: 'admin-typed test address, not a resident' },
  { file: 'lib/reports/process-schedules.ts', fn: 'processDueSchedules', sites: 1, reason: 'report_schedules.recipients are raw addresses' },
  { file: 'lib/whatsapp/admin.ts', fn: 'createSupabaseWhatsAppAdminRepository', sites: 1, reason: 'recipient is the admin account itself (profiles.email): follow the global switch' },
  { file: 'lib/notifications/send.ts', fn: 'sendAdminAddressedEmail', sites: 1, reason: 'queued email to an admin account (profiles.email, #982): follow the global switch' },
  { file: 'lib/whatsapp/debt-report.ts', fn: 'replyDebtReportFailed', sites: 1, reason: "failure reply to the admin's linked WhatsApp number (#982): follow the global switch" },
  { file: 'actions/two-factor/setup.ts', fn: 'initiateTwoFactorSetup', sites: 2, purpose: 'self_auth_2fa', reason: 'self-addressed code to the signed-in user' },
  { file: 'actions/two-factor/verify.ts', fn: 'sendTwoFactorCode', sites: 2, purpose: 'self_auth_2fa', reason: 'self-addressed code to the signed-in user' },
  { file: 'lib/whatsapp/financial.ts', fn: 'sendFinancialReply', sites: 1, purpose: 'inbound_reply', reason: 'reply to whoever messaged us' },
  { file: 'lib/whatsapp/identity.ts', fn: 'sendReply', sites: 1, purpose: 'inbound_reply', reason: 'reply to whoever messaged us' },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(srcDir, file).split(path.sep).join('/');

function isTestOrOverrideModule(r: string): boolean {
  return r.startsWith('lib/comms-override/') || r.includes('__tests__/') || /\.test\.tsx?$/.test(r);
}

/** Blanks out comments and the contents of string and template literals, keeping offsets. */
export function maskLiterals(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && next === '*') {
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i++;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          out += ' ';
          i++;
        }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Index of the matching close paren for the open paren at `open` (string contents already masked). */
function closeParen(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '(') depth++;
    else if (masked[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return masked.length;
}

interface CallSite {
  seam: string;
  /** The enclosing function's name, or '' at module level. */
  fn: string;
  /** Arguments with string contents masked. */
  args: string;
  /** The same arguments with string contents intact. */
  rawArgs: string;
}

function enclosingFunction(masked: string, index: number): string {
  const pattern =
    /function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*(?::[^=;]+)?=>|\w+\s*=>)/g;
  let name = '';
  for (const m of masked.slice(0, index).matchAll(pattern)) name = m[1] ?? m[2] ?? name;
  return name;
}

export function findCallSites(rawSource: string): CallSite[] {
  const masked = maskLiterals(rawSource);
  const sites: CallSite[] = [];
  const pattern = new RegExp(`(?<![\\w.])(?<!function )(${SEAMS.join('|')})\\s*\\(`, 'g');
  for (const match of masked.matchAll(pattern)) {
    // `import { sendEmail }` has no paren, so only real calls and definitions get here.
    const open = match.index! + match[0].length - 1;
    const close = closeParen(masked, open);
    sites.push({
      seam: match[1],
      fn: enclosingFunction(masked, match.index!),
      args: masked.slice(open + 1, close),
      rawArgs: rawSource.slice(open + 1, close),
    });
  }
  return sites;
}

/**
 * Whether a call site passes a value that comes from the resident's stored flag: `residentOverride: X.residentOverride`
 * with X declared from the lookup in the same file, or (forwarding files only) the caller's context.
 */
export function passesStoredFlag(file: string, rawSource: string, site: CallSite): boolean {
  const masked = maskLiterals(rawSource);
  const m = /\bresidentOverride:\s*([A-Za-z_]\w*)\.residentOverride\b/.exec(site.args);
  if (m) {
    const declared = new RegExp(
      `\\b(?:const|let)\\s+${m[1]}\\s*=[^;]*\\b(?:resolveResidentOverride|residentOverrideFrom)\\(`
    );
    if (declared.test(masked)) return true;
  }
  if (FORWARDERS.has(file)) {
    const args = site.args.trim();
    return /\.\.\.context\b|\bcontext\??\.residentOverride\b/.test(args) || /,\s*context\s*(,|$)/.test(args);
  }
  return false;
}

const files = walk(srcDir).filter((f) => !isTestOrOverrideModule(rel(f)));
const callers = files
  .map((f) => {
    const source = readFileSync(f, 'utf8');
    return { file: rel(f), source, sites: findCallSites(source) };
  })
  .filter((c) => c.sites.length > 0);

const isAllowed = (file: string, fn: string) => NO_RESIDENT_CONTEXT.some((a) => a.file === file && a.fn === fn);

describe('findCallSites and passesStoredFlag (the scanner itself)', () => {
  const FILE = 'actions/example.ts';

  it('finds calls and their enclosing function, ignoring definitions, imports and strings', () => {
    const source = [
      "import { sendEmail } from '@/lib/email';",
      'export async function sendEmail(options) {}',
      "const note = 'sendEmail(not a call)';",
      'export async function notifyOne() {',
      '  const override = await resolveResidentOverride([id]);',
      '  await sendEmail({ to: x, residentOverride: override.residentOverride, subject: `a (b) ${c}` });',
      '}',
      'const notifyTwo = async () => {',
      '  await sendSms({ to: y });',
      '};',
    ].join('\n');
    const sites = findCallSites(source);
    expect(sites.map((s) => `${s.fn}:${s.seam}`)).toEqual(['notifyOne:sendEmail', 'notifyTwo:sendSms']);
    expect(passesStoredFlag(FILE, source, sites[0])).toBe(true);
    expect(passesStoredFlag(FILE, source, sites[1])).toBe(false);
  });

  it('does not match a method call or a longer name', () => {
    expect(findCallSites('client.sendEmail({ a: 1 }); mysendEmail({ a: 1 });')).toEqual([]);
  });

  it.each([
    ['a hard-coded false', 'residentOverride: false'],
    ['a hard-coded null', 'residentOverride: null'],
    ['a value that is not from the lookup', 'residentOverride: someOther.residentOverride'],
    ['the word only in a comment', '/* residentOverride: override.residentOverride */ to: x'],
    ['a bare context word', 'to: x, context: 1'],
  ])('rejects %s', (_label, args) => {
    const source = `async function f() {\n  const override = await resolveResidentOverride([id]);\n  await sendEmail({ ${args} });\n}`;
    const [site] = findCallSites(source);
    expect(passesStoredFlag(FILE, source, site)).toBe(false);
  });

  it('rejects a value whose source variable is not declared from the lookup', () => {
    const source = 'async function f() {\n  const override = { residentOverride: false };\n  await sendEmail({ residentOverride: override.residentOverride });\n}';
    const [site] = findCallSites(source);
    expect(passesStoredFlag(FILE, source, site)).toBe(false);
  });

  it('accepts a forwarded context only in the forwarding files', () => {
    const source = 'async function f(context) {\n  await sendSms({ to: x, ...context });\n}';
    const [site] = findCallSites(source);
    expect(passesStoredFlag('lib/sms/send-sms.ts', source, site)).toBe(true);
    expect(passesStoredFlag('actions/example.ts', source, site)).toBe(false);
  });
});

describe('every send-seam call site passes the resident stored flag (#716)', () => {
  it('finds the callers this scan is meant to cover', () => {
    const names = callers.map((c) => c.file);
    for (const expected of [
      'actions/email/send-welcome-email.ts',
      'actions/email/send-payment-receipt-email.ts',
      'actions/email/send-payment-reminders.ts',
      'lib/notifications/invoice-reminders.ts',
      'actions/announcements/send-multi-channel-emergency.ts',
      'actions/residents/move-out-owner.ts',
      'actions/residents/move-out-renter.ts',
      'actions/verification/send-verification.ts',
      'lib/notifications/send.ts',
    ]) {
      expect(names, expected).toContain(expected);
    }
  }, 30000);

  it('every call site outside the sanctioned functions passes a value from the stored flag', () => {
    const offenders = callers.flatMap((c) =>
      c.sites
        .filter((s) => !isAllowed(c.file, s.fn))
        .filter((s) => !passesStoredFlag(c.file, c.source, s))
        .map((s) => `${c.file}::${s.fn || '(module)'}: ${s.seam}(...) does not pass the resident's stored use_override_comms`)
    );
    expect(offenders).toEqual([]);
  }, 30000);

  it('the sanctioned non-resident functions hold exactly the listed calls, none with a resident flag', () => {
    for (const allowed of NO_RESIDENT_CONTEXT) {
      const caller = callers.find((c) => c.file === allowed.file);
      expect(caller, `${allowed.file} no longer calls a seam: remove it from the list`).toBeDefined();
      const inFn = caller!.sites.filter((s) => s.fn === allowed.fn);
      expect(inFn.length, `${allowed.file}::${allowed.fn} should hold exactly ${allowed.sites} seam call(s)`).toBe(allowed.sites);
      for (const site of inFn) {
        expect(site.args, `${allowed.file}::${allowed.fn} passes a resident flag`).not.toMatch(/\bresidentOverride\b/);
        if (allowed.purpose) {
          expect(site.rawArgs, `${allowed.file}::${allowed.fn} lost its exempt purpose`).toContain(`purpose: '${allowed.purpose}'`);
        }
      }
    }
  }, 30000);

  it('a sanctioned file has no seam call outside its listed functions', () => {
    const listedFiles = new Set(NO_RESIDENT_CONTEXT.map((a) => a.file));
    for (const caller of callers.filter((c) => listedFiles.has(c.file))) {
      for (const site of caller.sites) {
        expect(isAllowed(caller.file, site.fn) || passesStoredFlag(caller.file, caller.source, site), `${caller.file}::${site.fn}`).toBe(true);
      }
    }
  }, 30000);

  it('queue senders reach the seams only through the flag lookup', () => {
    const source = readFileSync(path.join(srcDir, 'lib/notifications/send.ts'), 'utf8');
    // sendAndRecordNotification and sendImmediate both go through sendWithResidentFlag ...
    expect(source.match(/await sendWithResidentFlag\(/g)).toHaveLength(2);
    // ... and the only other sendNotification call is the one inside it, which passes the looked-up flag.
    const direct = findCallSites(source).filter((s) => s.seam === 'sendNotification');
    expect(direct.filter((s) => !isAllowed('lib/notifications/send.ts', s.fn) && !passesStoredFlag('lib/notifications/send.ts', source, s))).toHaveLength(0);
  }, 30000);
});
