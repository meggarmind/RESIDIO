import { describe, expect, it } from 'vitest';
import { checkAlertSender, fromAddressOf } from '@/lib/email-imports/sender-check';

/**
 * #1340 sender check, hardened in #1353. The fixture is the real auto-forwarded FirstBank credit
 * alert (30 Oct 2026), signature values shortened. Headers are in the order Gmail returns them:
 * Gmail's own Authentication-Results, added on delivery, is the topmost one.
 */

const FROM = 'FirstBank <FirstAlert@firstbanknigeria.com>';

const REAL_AUTH_RESULTS =
  'mx.google.com; dkim=pass header.i=@firstbanknigeria.com header.s=pepipost header.b=abc; ' +
  'dkim=pass header.i=@env.etransmail.com header.s=x header.b=y; ' +
  'arc=pass (i=1 spf=pass spfdomain=gmail.com dkim=pass dkdomain=firstbanknigeria.com dmarc=pass fromdomain=firstbanknigeria.com); ' +
  'spf=pass (google.com: domain of opera4street+caf_=residio.box=gmail.com@gmail.com designates 1.2.3.4 as permitted sender) smtp.mailfrom="opera4street+caf_=residio.box=gmail.com@gmail.com"; ' +
  'dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=firstbanknigeria.com';

const ar = (value: string) => ({ name: 'Authentication-Results', value });

function sample(authResults = REAL_AUTH_RESULTS, lower: { name: string; value: string }[] = []) {
  return [
    { name: 'Delivered-To', value: 'residio.box@gmail.com' },
    { name: 'ARC-Authentication-Results', value: `i=2; ${REAL_AUTH_RESULTS}` },
    ar(authResults),
    { name: 'X-Forwarded-To', value: 'residio.box@gmail.com' },
    ...lower,
    { name: 'From', value: FROM },
  ];
}

const check = (authResults?: string, from = FROM, lower?: { name: string; value: string }[]) =>
  checkAlertSender(sample(authResults, lower), from);

// A forged passing header a sender put lower in the message.
const FORGED_LOWER = [
  ar('mx.google.com; dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com'),
];

describe('checkAlertSender (#1340, #1353)', () => {
  it('passes the real auto-forwarded alert', () => {
    expect(check()).toEqual({
      verified: true,
      detail: 'dkim=pass header.d=firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com; From firstalert@firstbanknigeria.com',
    });
  });

  it('accepts header.d and a FirstBank subdomain for DKIM and From', () => {
    const result = check(
      'mx.google.com; dkim=pass header.d=mail.firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com',
      'alerts@mail.firstbanknigeria.com'
    );
    expect(result.verified).toBe(true);
  });

  it('fails closed with no header at all', () => {
    expect(checkAlertSender([], FROM)).toEqual({ verified: false, detail: 'No Authentication-Results header' });
    expect(checkAlertSender(undefined, null).verified).toBe(false);
  });

  describe('RFC 8601 parsing', () => {
    it('ignores results injected through a quoted value (quote injection)', () => {
      const result = check(
        'mx.google.com; dkim=none; spf=pass smtp.mailfrom="x;dkim=pass header.i=@firstbanknigeria.com;dmarc=pass header.from=firstbanknigeria.com"@evil.com; dmarc=fail header.from=firstbanknigeria.com'
      );
      expect(result).toEqual({ verified: false, detail: 'No dkim=pass for firstbanknigeria.com' });
    });

    it('does not let an escaped quote end a quoted string early', () => {
      const result = check(
        'mx.google.com; dkim=none; spf=pass smtp.mailfrom="a\\"b;dkim=pass header.i=@firstbanknigeria.com;dmarc=pass header.from=firstbanknigeria.com"@evil.com; dmarc=fail header.from=firstbanknigeria.com'
      );
      expect(result.detail).toBe('No dkim=pass for firstbanknigeria.com');
    });

    it('ignores results inside a nested comment holding ; and ) (comment injection)', () => {
      const result = check(
        'mx.google.com; dkim=fail (a (b) c; dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com) header.i=@firstbanknigeria.com; dmarc=fail header.from=firstbanknigeria.com'
      );
      expect(result).toEqual({ verified: false, detail: 'No dkim=pass for firstbanknigeria.com' });
    });

    it('does not take a quoted property name as header.i', () => {
      const result = check(
        'mx.google.com; dkim=pass header.i=@evil.com "header.i=@firstbanknigeria.com"; dmarc=pass header.from=firstbanknigeria.com'
      );
      expect(result.detail).toBe('No dkim=pass for firstbanknigeria.com');
    });

    it.each([
      ['an unterminated quote', 'mx.google.com; dkim=pass header.i=@firstbanknigeria.com; spf=pass smtp.mailfrom="x; dmarc=pass header.from=firstbanknigeria.com'],
      ['an unterminated comment', 'mx.google.com; dkim=pass header.i=@firstbanknigeria.com (open; dmarc=pass header.from=firstbanknigeria.com'],
      ['a quoted result', 'mx.google.com; "dkim=pass" header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com'],
      ['a part with no method=result', 'mx.google.com; dkim=pass header.i=@firstbanknigeria.com; garbage; dmarc=pass header.from=firstbanknigeria.com'],
    ])('fails closed on %s', (_label, authResults) => {
      expect(check(authResults)).toEqual({ verified: false, detail: 'Authentication-Results is malformed' });
    });

    it.each([
      ['header.d', 'mx.google.com; dkim=pass header.d=evil.com header.d=firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com'],
      ['header.i', 'mx.google.com; dkim=pass header.i=@evil.com header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com'],
      ['header.from', 'mx.google.com; dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=evil.com header.from=firstbanknigeria.com'],
    ])('fails closed on a repeated %s in one result', (key, authResults) => {
      expect(check(authResults)).toEqual({ verified: false, detail: `Authentication-Results repeats ${key} in one result` });
    });

    it('fails closed on two DMARC results, or a FirstBank DKIM pass and fail for one domain', () => {
      for (const authResults of [
        'mx.google.com; dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com; dmarc=fail header.from=firstbanknigeria.com',
        'mx.google.com; dkim=pass header.i=@firstbanknigeria.com; dkim=fail header.d=firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com',
      ]) {
        expect(check(authResults)).toEqual({ verified: false, detail: 'Authentication-Results has conflicting results' });
      }
    });
  });

  describe('topmost header only', () => {
    it('fails when the top header fails and a forged lower one passes', () => {
      const result = check('mx.google.com; dkim=none; dmarc=fail header.from=firstbanknigeria.com', FROM, FORGED_LOWER);
      expect(result.verified).toBe(false);
    });

    it.each([
      ['an unterminated quote', 'mx.google.com; dkim=none; spf=pass smtp.mailfrom="x@evil.com'],
      ['an unterminated comment', 'mx.google.com; dkim=none (open'],
      ['a quoted authserv-id', '"mx.google.com"; dkim=none'],
    ])('never falls through to a forged lower header when the top one has %s', (_label, authResults) => {
      expect(check(authResults, FROM, FORGED_LOWER)).toEqual({ verified: false, detail: 'Authentication-Results is malformed' });
    });

    it('fails when the topmost header is not from mx.google.com, even with Gmail\'s below it', () => {
      const headers = [ar('relay.example.net; dkim=pass header.d=firstbanknigeria.com'), ...sample()];
      expect(checkAlertSender(headers, FROM)).toEqual({
        verified: false,
        detail: 'Authentication-Results is not from mx.google.com',
      });
    });

    it('refuses a lookalike authserv-id', () => {
      expect(check(REAL_AUTH_RESULTS.replace('mx.google.com;', 'mx.google.com.evil.io;')).detail).toBe(
        'Authentication-Results is not from mx.google.com'
      );
    });
  });

  describe('DKIM and DMARC', () => {
    it('fails with no DMARC result', () => {
      expect(check('mx.google.com; dkim=pass header.i=@firstbanknigeria.com')).toEqual({
        verified: false,
        detail: 'No dmarc=pass header.from=firstbanknigeria.com',
      });
    });

    it('fails on DMARC for another domain, or a DMARC fail', () => {
      for (const dmarc of ['dmarc=pass header.from=gmail.com', 'dmarc=fail header.from=firstbanknigeria.com', 'dmarc=pass']) {
        expect(check(`mx.google.com; dkim=pass header.i=@firstbanknigeria.com; ${dmarc}`).detail).toBe(
          'No dmarc=pass header.from=firstbanknigeria.com'
        );
      }
    });

    it('no longer trusts firstbank.com as a DKIM domain', () => {
      const result = check(
        'mx.google.com; dkim=pass header.d=firstbank.com; dmarc=pass header.from=firstbanknigeria.com'
      );
      expect(result).toEqual({ verified: false, detail: 'No dkim=pass for firstbanknigeria.com' });
    });

    it('refuses lookalike DKIM domains and a FirstBank signature that did not pass', () => {
      for (const dkim of [
        'dkim=pass header.d=firstbanknigeria.com.evil.io',
        'dkim=pass header.d=evilfirstbanknigeria.com',
        'dkim=pass header.i=@firstbanknigeria.co',
        'dkim=fail header.i=@firstbanknigeria.com',
        'dkim=neutral header.i=@firstbanknigeria.com',
        'spf=pass smtp.mailfrom=alert@firstbanknigeria.com',
      ]) {
        expect(check(`mx.google.com; ${dkim}; dmarc=pass header.from=firstbanknigeria.com`).verified).toBe(false);
      }
    });
  });

  describe('From', () => {
    it.each([
      'FirstBank <FirstAlert@firstbanknigeria.com>, Other <x@evil.com>',
      'x@evil.com, FirstAlert@firstbanknigeria.com',
      'FirstBank <x@evil.com@firstbanknigeria.com>',
      'FirstAlert@firstbanknigeria.com <x@evil.com>',
      'Bank <FirstAlert@firstbanknigeria.com> <x@evil.com>',
      '"x@evil.com"@firstbanknigeria.com',
      'Bank <"x;y"@firstbanknigeria.com>',
      'Undisclosed:;',
      '',
    ])('fails when From is not exactly one address: %s', (from) => {
      expect(check(undefined, from)).toEqual({ verified: false, detail: 'From is not exactly one address' });
    });

    it('fails when there are two From headers', () => {
      const headers = [...sample(), { name: 'From', value: 'someone@evil.com' }];
      expect(checkAlertSender(headers, FROM)).toEqual({ verified: false, detail: 'More than one From header' });
    });

    it('fails when From is not at FirstBank, even with FirstBank signatures', () => {
      expect(check(undefined, 'Spoof <alert@firstbanknigeria.com.evil.io>').verified).toBe(false);
    });

    it('refuses a manual forward from the estate mailbox', () => {
      const result = checkAlertSender(
        [ar('mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601; spf=pass smtp.mailfrom=estate.mailbox@gmail.com; dmarc=pass header.from=gmail.com')],
        'Estate <estate.mailbox@gmail.com>'
      );
      expect(result).toEqual({
        verified: false,
        detail: 'Manual forward: not a FirstBank-signed alert (From estate.mailbox@gmail.com)',
      });
    });
  });
});

describe('fromAddressOf', () => {
  it('takes the bare, lower-cased single address', () => {
    expect(fromAddressOf('FirstBank <FirstAlert@FirstBankNigeria.com>')).toBe('firstalert@firstbanknigeria.com');
    expect(fromAddressOf('a@b.co')).toBe('a@b.co');
    expect(fromAddressOf('no address')).toBeNull();
    expect(fromAddressOf(null)).toBeNull();
  });
});
