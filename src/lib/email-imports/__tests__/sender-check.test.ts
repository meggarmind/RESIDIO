import { describe, expect, it } from 'vitest';
import { checkAlertSender, fromAddressOf, parseAuthResults } from '@/lib/email-imports/sender-check';

/**
 * #1340 / #1353 sender check. The FirstBank facts come from a real alert (#1353 provenance):
 * `From: FirstBank <FirstAlert@firstbanknigeria.com>`,
 * `dkim=pass header.i=@firstbanknigeria.com header.s=pepipost`,
 * `dmarc=pass (p=REJECT) header.from=firstbanknigeria.com`. The rest follows Gmail's format.
 */

const ESTATE = 'estate.mailbox@gmail.com';
const FROM = 'FirstBank <FirstAlert@firstbanknigeria.com>';

const ar = (value: string) => ({ name: 'Authentication-Results', value });
const from = (value: string) => ({ name: 'From', value });

const GOOD_AR =
  'mx.google.com;\r\n       dkim=pass header.i=@firstbanknigeria.com header.s=pepipost header.b=Ab/C+12=;\r\n' +
  '       arc=pass (i=1 spf=pass spfdomain=firstbanknigeria.com dkim=pass dkdomain=firstbanknigeria.com);\r\n' +
  '       spf=softfail (google.com: domain of transitioning FirstAlert@firstbanknigeria.com does not designate 209.85.220.41 as permitted sender) smtp.mailfrom=FirstAlert@firstbanknigeria.com;\r\n' +
  '       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=firstbanknigeria.com';

// A FirstBank alert auto-forwarded by a Gmail filter: DKIM and DMARC survive, SPF for FirstBank fails.
const AUTO_FORWARD = [
  { name: 'Delivered-To', value: 'app.box@gmail.com' },
  { name: 'ARC-Authentication-Results', value: 'i=2; mx.google.com; dkim=pass header.i=@firstbanknigeria.com' },
  ar(GOOD_AR),
  from(FROM),
];

const withAr = (value: string, fromValue = FROM) => [ar(value), from(fromValue)];
const PASS = 'dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com';

describe('checkAlertSender (#1353)', () => {
  it('passes a FirstBank alert auto-forwarded by a Gmail filter', () => {
    expect(checkAlertSender(AUTO_FORWARD)).toEqual({
      verified: true,
      detail:
        'dkim=pass header.d=firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com; from=firstalert@firstbanknigeria.com',
    });
  });

  it('reads header.d as well as header.i, and accepts a FirstBank subdomain for DKIM and From', () => {
    const headers = withAr(
      'mx.google.com; dkim=pass header.d=alerts.firstbanknigeria.com header.s=s1; dmarc=pass header.from=firstbanknigeria.com',
      'x@alerts.firstbanknigeria.com'
    );
    expect(checkAlertSender(headers)).toMatchObject({ verified: true });
  });

  it('refuses lookalike DKIM domains', () => {
    for (const d of ['firstbanknigeria.com.evil.io', 'evilfirstbanknigeria.com', 'firstbanknigeria.co']) {
      const headers = withAr(`mx.google.com; dkim=pass header.d=${d}; dmarc=pass header.from=firstbanknigeria.com`);
      expect(checkAlertSender(headers).verified).toBe(false);
    }
  });

  it('no longer trusts firstbank.com as a DKIM domain', () => {
    const headers = withAr('mx.google.com; dkim=pass header.d=firstbank.com; dmarc=pass header.from=firstbanknigeria.com');
    expect(checkAlertSender(headers)).toEqual({ verified: false, detail: 'No dkim=pass for firstbanknigeria.com' });
  });

  it('refuses a signature whose header.d and header.i disagree', () => {
    const headers = withAr(
      'mx.google.com; dkim=pass header.d=evil.io header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com'
    );
    expect(checkAlertSender(headers).verified).toBe(false);
  });

  it('refuses a FirstBank signature that did not pass', () => {
    for (const result of ['fail', 'neutral', 'temperror', 'none']) {
      const headers = withAr(`mx.google.com; dkim=${result} header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com`);
      expect(checkAlertSender(headers).verified).toBe(false);
    }
  });

  it('does not accept SPF for FirstBank, which a forward breaks anyway', () => {
    const headers = withAr('mx.google.com; spf=pass smtp.mailfrom=alert@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com');
    expect(checkAlertSender(headers).verified).toBe(false);
  });

  it('requires dmarc=pass with header.from=firstbanknigeria.com', () => {
    const cases = [
      'dkim=pass header.i=@firstbanknigeria.com',
      'dkim=pass header.i=@firstbanknigeria.com; dmarc=fail header.from=firstbanknigeria.com',
      'dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=evil.io',
      'dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=alerts.firstbanknigeria.com',
      'dkim=pass header.i=@firstbanknigeria.com; dmarc=pass',
      'dkim=pass header.i=@firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com; dmarc=fail header.from=firstbanknigeria.com',
    ];
    for (const results of cases) {
      expect(checkAlertSender(withAr(`mx.google.com; ${results}`))).toEqual({
        verified: false,
        detail: 'No dmarc=pass header.from=firstbanknigeria.com',
      });
    }
  });

  it('requires From to be exactly one firstbanknigeria.com address', () => {
    const cases = [
      `Estate <${ESTATE}>`,
      'alert@firstbanknigeria.com.evil.io',
      'FirstBank <a@firstbanknigeria.com>, b@evil.io',
      'a@firstbanknigeria.com, b@firstbanknigeria.com',
      '"x <a@firstbanknigeria.com>" <a@evil.io>',
      'FirstBank: a@firstbanknigeria.com;',
      'no address',
    ];
    for (const value of cases) {
      expect(checkAlertSender(withAr(`mx.google.com; ${PASS}`, value))).toEqual({
        verified: false,
        detail: 'From is not one firstbanknigeria.com address (a manual forward needs review)',
      });
    }
  });

  it('refuses a message with no From header or two of them', () => {
    expect(checkAlertSender([ar(`mx.google.com; ${PASS}`)]).verified).toBe(false);
    expect(checkAlertSender([...withAr(`mx.google.com; ${PASS}`), from('evil@evil.io')]).verified).toBe(false);
  });

  it('queues a manual forward from the estate mailbox, even with every Gmail check passing for it', () => {
    const headers = withAr(
      `mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601; spf=pass smtp.mailfrom=${ESTATE}; dmarc=pass header.from=gmail.com`,
      `Estate <${ESTATE}>`
    );
    expect(checkAlertSender(headers)).toMatchObject({ verified: false });
  });

  it('reads only the topmost Authentication-Results: a forged one lower down does not count', () => {
    const headers = [ar('mx.google.com; dkim=none; spf=fail smtp.mailfrom=attacker@evil.io'), ar(`mx.google.com; ${PASS}`), from(FROM)];
    expect(checkAlertSender(headers).verified).toBe(false);
  });

  it('fails closed on a malformed topmost header, never falling through to a lower one', () => {
    const headers = [ar(`mx.google.com; dkim=pass header.i="@firstbanknigeria.com`), ar(`mx.google.com; ${PASS}`), from(FROM)];
    expect(checkAlertSender(headers)).toMatchObject({ verified: false, detail: expect.stringMatching(/^Authentication-Results is malformed/) });
  });

  it('refuses an Authentication-Results header not added by mx.google.com', () => {
    expect(checkAlertSender(withAr(`evil.io; ${PASS}`))).toEqual({
      verified: false,
      detail: 'Authentication-Results is not from mx.google.com',
    });
  });

  it('fails closed with no header at all', () => {
    expect(checkAlertSender([from(FROM)])).toEqual({ verified: false, detail: 'No Authentication-Results header' });
    expect(checkAlertSender(undefined).verified).toBe(false);
  });

  it('a quoted value cannot inject a fake result segment', () => {
    const headers = withAr(
      'mx.google.com; dkim=fail header.i="x;dkim=pass header.d=firstbanknigeria.com"; dmarc=pass header.from=firstbanknigeria.com'
    );
    expect(checkAlertSender(headers)).toEqual({ verified: false, detail: 'No dkim=pass for firstbanknigeria.com' });
  });

  it('a comment holding ")" or ";" cannot inject a fake result segment', () => {
    const cases = [
      'mx.google.com; dkim=fail (bad (nested) sig; dkim=pass header.d=firstbanknigeria.com) header.d=evil.io; dmarc=pass header.from=firstbanknigeria.com',
      'mx.google.com; dkim=fail (a \\) b; dkim=pass header.d=firstbanknigeria.com) header.d=evil.io; dmarc=pass header.from=firstbanknigeria.com',
    ];
    for (const value of cases) {
      expect(checkAlertSender(withAr(value))).toEqual({ verified: false, detail: 'No dkim=pass for firstbanknigeria.com' });
    }
  });

  it('fails closed on a repeated property in one result', () => {
    const headers = withAr(
      'mx.google.com; dkim=pass header.d=evil.io header.d=firstbanknigeria.com; dmarc=pass header.from=firstbanknigeria.com'
    );
    expect(checkAlertSender(headers)).toEqual({
      verified: false,
      detail: 'Authentication-Results is malformed: repeated header.d in dkim',
    });
  });
});

describe('parseAuthResults', () => {
  it('parses Gmail’s header with comments, quoted values and base64 property values', () => {
    expect(parseAuthResults(GOOD_AR)).toEqual({
      authServId: 'mx.google.com',
      results: [
        { method: 'dkim', result: 'pass', props: { 'header.i': '@firstbanknigeria.com', 'header.s': 'pepipost', 'header.b': 'ab/c+12=' } },
        { method: 'arc', result: 'pass', props: {} },
        { method: 'spf', result: 'softfail', props: { 'smtp.mailfrom': 'firstalert@firstbanknigeria.com' } },
        { method: 'dmarc', result: 'pass', props: { 'header.from': 'firstbanknigeria.com' } },
      ],
    });
  });

  it('accepts a version and a no-result header', () => {
    expect(parseAuthResults('mx.google.com 1; none')).toEqual({ authServId: 'mx.google.com', results: [] });
    expect(parseAuthResults('mx.google.com; spf=pass smtp.mailfrom="a;b@x.io"').results[0].props).toEqual({
      'smtp.mailfrom': 'a;b@x.io',
    });
  });

  it.each([
    ['an unterminated comment', 'mx.google.com; dkim=pass (oops header.d=x.io'],
    ['an unterminated quote', 'mx.google.com; dkim=pass header.d="x.io'],
    ['a stray ")"', 'mx.google.com; dkim=pass ) header.d=x.io'],
    ['a missing "="', 'mx.google.com; dkim pass'],
    ['a property with no value', 'mx.google.com; dkim=pass header.d='],
    ['an empty segment', 'mx.google.com;; dkim=pass'],
    ['a bad version', 'mx.google.com v1; dkim=pass'],
  ])('throws on %s', (_label, value) => {
    expect(() => parseAuthResults(value)).toThrow();
  });
});

describe('fromAddressOf', () => {
  it('takes the bare, lower-cased address of one mailbox', () => {
    expect(fromAddressOf(FROM)).toBe('firstalert@firstbanknigeria.com');
    expect(fromAddressOf('"First, Bank" <a@b.co>')).toBe('a@b.co');
    expect(fromAddressOf('a@b.co (FirstBank)')).toBe('a@b.co');
    expect(fromAddressOf('a@b.co')).toBe('a@b.co');
  });

  it('returns null for anything but exactly one address', () => {
    expect(fromAddressOf('no address')).toBeNull();
    expect(fromAddressOf('a@b.co, c@d.co')).toBeNull();
    expect(fromAddressOf('<a@b.co> <c@d.co>')).toBeNull();
    expect(fromAddressOf('a@b@c.co')).toBeNull();
    expect(fromAddressOf('"unterminated <a@b.co>')).toBeNull();
    expect(fromAddressOf(null)).toBeNull();
  });
});
