import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #716: every call to a send seam must say which resident it is for, so the
 * per-resident flag reaches the resolver. A call site passes the context when
 * its argument list mentions `residentOverride` (or forwards a `context`). A
 * file that calls a seam and does not is either a sanctioned non-resident caller
 * listed below with its reason, or a defect.
 *
 * Callers of `sendImmediate` and `addToQueue` are not scanned: both carry a
 * resident id, and the flag is looked up inside `sendImmediate` and
 * `sendAndRecordNotification` (covered by resident-flag-wiring.test.ts). Queue
 * rows keep the real recipient and the redirect happens at send time.
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

/** Sanctioned callers that pass no resident context. Each needs a reason. */
const NO_RESIDENT_CONTEXT: Record<string, string> = {
  'actions/email/send-admin-alert.ts': 'recipients are staff (profiles.email), not residents: follow the global switch',
  'actions/email/test-email.ts': 'admin-typed test address, not a resident',
  'lib/reports/process-schedules.ts': 'report_schedules.recipients are raw addresses, not residents',
  'actions/two-factor/setup.ts': 'exempt purpose self_auth_2fa: self-addressed code to the signed-in user',
  'actions/two-factor/verify.ts': 'exempt purpose self_auth_2fa: self-addressed code to the signed-in user',
  'lib/whatsapp/financial.ts': 'exempt purpose inbound_reply: reply to whoever messaged us',
  'lib/whatsapp/identity.ts': 'exempt purpose inbound_reply: reply to whoever messaged us',
};

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

/** The text between the parentheses of a call, skipping string and template contents. */
export function callArguments(source: string, openParen: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(openParen + 1, i);
    }
  }
  return source.slice(openParen + 1);
}

interface CallSite {
  seam: string;
  args: string;
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

export function findCallSites(rawSource: string): CallSite[] {
  const source = maskLiterals(rawSource);
  const sites: CallSite[] = [];
  const pattern = new RegExp(`(?<![\\w.])(?<!function )(${SEAMS.join('|')})\\s*\\(`, 'g');
  for (const match of source.matchAll(pattern)) {
    // `import { sendEmail }` has no paren, so only real calls and definitions get here.
    const open = match.index! + match[0].length - 1;
    sites.push({ seam: match[1], args: callArguments(source, open) });
  }
  return sites;
}

const passesContext = (args: string) => /\bresidentOverride\b|\.\.\.context\b/.test(args) || /\bcontext\b/.test(args);

const files = walk(srcDir).filter((f) => !isTestOrOverrideModule(rel(f)));
const callers = files
  .map((f) => ({ file: rel(f), sites: findCallSites(readFileSync(f, 'utf8')) }))
  .filter((c) => c.sites.length > 0);

describe('findCallSites (the scanner itself)', () => {
  it('finds a call and its arguments, ignoring definitions, imports and strings', () => {
    const source = [
      "import { sendEmail } from '@/lib/email';",
      'export async function sendEmail(options) {}',
      "const note = 'sendEmail(not a call)';",
      'await sendEmail({ to: x, residentOverride: flag, subject: `a (b) ${c}` });',
      'await sendSms({ to: y });',
    ].join('\n');
    const sites = findCallSites(source);
    expect(sites.map((s) => s.seam)).toEqual(['sendEmail', 'sendSms']);
    expect(passesContext(sites[0].args)).toBe(true);
    expect(passesContext(sites[1].args)).toBe(false);
  });

  it('does not match a method call or a longer name', () => {
    expect(findCallSites('client.sendEmail({ a: 1 }); mysendEmail({ a: 1 });')).toEqual([]);
  });
});

describe('every send-seam call site says which resident it is for (#716)', () => {
  it('finds the callers this scan is meant to cover', () => {
    const names = callers.map((c) => c.file);
    for (const expected of [
      'actions/email/send-welcome-email.ts',
      'actions/email/send-payment-receipt-email.ts',
      'actions/email/send-payment-reminders.ts',
      'actions/notifications/invoice-reminders.ts',
      'actions/announcements/send-multi-channel-emergency.ts',
      'actions/residents/move-out-owner.ts',
      'actions/residents/move-out-renter.ts',
      'actions/verification/send-verification.ts',
      'lib/notifications/send.ts',
    ]) {
      expect(names, expected).toContain(expected);
    }
  }, 30000);

  it('passes the context at every call site outside the sanctioned list', () => {
    const offenders = callers
      .filter((c) => !(c.file in NO_RESIDENT_CONTEXT))
      .flatMap((c) =>
        c.sites
          // A definition's own parameter list is not a call site.
          .filter((s) => !passesContext(s.args))
          .map((s) => `${c.file}: ${s.seam}(...) passes no residentOverride`)
      );
    expect(offenders).toEqual([]);
  }, 30000);

  it('keeps the sanctioned list honest: every entry still calls a seam and still passes none', () => {
    for (const file of Object.keys(NO_RESIDENT_CONTEXT)) {
      const caller = callers.find((c) => c.file === file);
      expect(caller, `${file} no longer calls a seam: remove it from the list`).toBeDefined();
      const passing = caller!.sites.filter((s) => /\bresidentOverride\b/.test(s.args));
      expect(passing, `${file} passes residentOverride: remove it from the list`).toEqual([]);
    }
  }, 30000);

  it('queue senders reach the seams only through the flag lookup', () => {
    const source = readFileSync(path.join(srcDir, 'lib/notifications/send.ts'), 'utf8');
    // sendAndRecordNotification and sendImmediate both go through sendWithResidentFlag ...
    expect(source.match(/await sendWithResidentFlag\(/g)).toHaveLength(2);
    // ... and the only other sendNotification call is the one inside it, which forwards the flag.
    const bare = findCallSites(source).filter((s) => s.seam === 'sendNotification');
    expect(bare.filter((s) => !/residentOverride/.test(s.args))).toHaveLength(0);
  }, 30000);
});
