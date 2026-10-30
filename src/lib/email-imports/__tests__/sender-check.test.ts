import { describe, expect, it } from 'vitest';
import { checkAlertSender, fromAddressOf } from '@/lib/email-imports/sender-check';

/**
 * #1340 sender check. The fixtures follow the header shape Gmail adds on delivery. The issue asks
 * for a real auto-forwarded alert's headers as a fixture; none was available when this was
 * written, so these are built from Gmail's documented format and must be compared with a real
 * sample once the owner connects the app mailbox.
 */

const ESTATE = 'estate.mailbox@gmail.com';
const SENDERS = ['alert@firstbanknigeria.com', 'firstbanknigeria.com', ESTATE];

const ar = (value: string) => ({ name: 'Authentication-Results', value });

// A FirstBank alert auto-forwarded by a Gmail filter: DKIM survives, SPF for FirstBank fails.
const AUTO_FORWARD = [
  { name: 'Delivered-To', value: 'app.box@gmail.com' },
  { name: 'ARC-Authentication-Results', value: 'i=2; mx.google.com; dkim=pass header.i=@firstbanknigeria.com' },
  ar(
    'mx.google.com;\r\n       dkim=pass header.i=@firstbanknigeria.com header.s=sel1 header.b=AbC123;\r\n' +
      '       arc=pass (i=1 spf=pass spfdomain=firstbanknigeria.com dkim=pass dkdomain=firstbanknigeria.com);\r\n' +
      '       spf=softfail (google.com: domain of transitioning alert@firstbanknigeria.com does not designate 209.85.220.41 as permitted sender) smtp.mailfrom=alert@firstbanknigeria.com;\r\n' +
      '       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=firstbanknigeria.com'
  ),
  { name: 'From', value: 'FirstBank <alert@firstbanknigeria.com>' },
];

describe('checkAlertSender (#1340)', () => {
  it('passes a FirstBank alert auto-forwarded by a Gmail filter on its DKIM signature alone', () => {
    expect(checkAlertSender(AUTO_FORWARD, 'FirstBank <alert@firstbanknigeria.com>', SENDERS)).toEqual({
      verified: true,
      detail: 'dkim=pass header.d=firstbanknigeria.com',
    });
  });

  it('reads header.d as well as header.i, and accepts a FirstBank subdomain', () => {
    const headers = [ar('mx.google.com; dkim=pass header.d=alerts.firstbanknigeria.com header.s=s1')];
    expect(checkAlertSender(headers, 'x@alerts.firstbanknigeria.com', [])).toMatchObject({ verified: true });
  });

  it('refuses lookalike domains', () => {
    for (const d of ['firstbanknigeria.com.evil.io', 'evilfirstbanknigeria.com', 'firstbanknigeria.co']) {
      const headers = [ar(`mx.google.com; dkim=pass header.d=${d}`)];
      expect(checkAlertSender(headers, `alert@${d}`, SENDERS).verified).toBe(false);
    }
  });

  it('refuses a FirstBank signature that did not pass', () => {
    for (const result of ['fail', 'neutral', 'temperror', 'none']) {
      const headers = [ar(`mx.google.com; dkim=${result} header.i=@firstbanknigeria.com`)];
      expect(checkAlertSender(headers, 'alert@firstbanknigeria.com', SENDERS).verified).toBe(false);
    }
  });

  it('does not accept SPF for FirstBank, which a forward breaks anyway', () => {
    const headers = [ar('mx.google.com; spf=pass smtp.mailfrom=alert@firstbanknigeria.com')];
    expect(checkAlertSender(headers, 'alert@firstbanknigeria.com', SENDERS).verified).toBe(false);
  });

  it('reads only the topmost Authentication-Results: a forged one lower down does not count', () => {
    const headers = [
      ar('mx.google.com; dkim=none; spf=fail smtp.mailfrom=attacker@evil.io'),
      ar('mx.google.com; dkim=pass header.i=@firstbanknigeria.com'),
    ];
    expect(checkAlertSender(headers, 'alert@firstbanknigeria.com', SENDERS).verified).toBe(false);
  });

  it('refuses an Authentication-Results header not added by mx.google.com', () => {
    const headers = [ar('evil.io; dkim=pass header.i=@firstbanknigeria.com')];
    expect(checkAlertSender(headers, 'alert@firstbanknigeria.com', SENDERS)).toEqual({
      verified: false,
      detail: 'Authentication-Results is not from mx.google.com',
    });
  });

  it('fails closed with no header at all', () => {
    expect(checkAlertSender([], 'alert@firstbanknigeria.com', SENDERS)).toEqual({
      verified: false,
      detail: 'No Authentication-Results header',
    });
    expect(checkAlertSender(undefined, null, null).verified).toBe(false);
  });

  it('passes a manual forward from the estate mailbox in the sender list with dkim=pass for gmail.com', () => {
    const headers = [ar('mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601; spf=pass smtp.mailfrom=estate.mailbox@gmail.com')];
    expect(checkAlertSender(headers, `Estate <${ESTATE}>`, SENDERS)).toEqual({
      verified: true,
      detail: `dkim=pass header.d=gmail.com for forwarding address ${ESTATE}`,
    });
  });

  it('passes a forwarding address on spf=pass for that address', () => {
    const headers = [ar(`mx.google.com; dkim=none; spf=pass (google.com: domain of ${ESTATE} designates 1.2.3.4) smtp.mailfrom=${ESTATE}`)];
    expect(checkAlertSender(headers, ESTATE, SENDERS)).toMatchObject({ verified: true });
  });

  it('refuses any other gmail.com sender, even with dkim=pass for gmail.com', () => {
    const headers = [ar('mx.google.com; dkim=pass header.i=@gmail.com; spf=pass smtp.mailfrom=someone.else@gmail.com')];
    expect(checkAlertSender(headers, 'someone.else@gmail.com', SENDERS).verified).toBe(false);
  });

  it('refuses the estate address when it is not in the sender list', () => {
    const headers = [ar('mx.google.com; dkim=pass header.i=@gmail.com')];
    expect(checkAlertSender(headers, ESTATE, ['firstbanknigeria.com']).verified).toBe(false);
  });

  it('refuses a forged From of the estate mailbox with no passing gmail.com result', () => {
    const headers = [ar(`mx.google.com; dkim=pass header.d=evil.io; spf=fail smtp.mailfrom=${ESTATE}`)];
    expect(checkAlertSender(headers, ESTATE, SENDERS)).toEqual({
      verified: false,
      detail: `Forwarding address ${ESTATE} has no dkim=pass or spf=pass`,
    });
  });

  it('never treats a domain-only sender list entry as a forwarding address', () => {
    const headers = [ar('mx.google.com; dkim=pass header.i=@gmail.com')];
    expect(checkAlertSender(headers, 'anyone@gmail.com', ['gmail.com']).verified).toBe(false);
  });
});

describe('fromAddressOf', () => {
  it('takes the bare, lower-cased address', () => {
    expect(fromAddressOf('FirstBank <Alert@FirstBankNigeria.com>')).toBe('alert@firstbanknigeria.com');
    expect(fromAddressOf('a@b.co')).toBe('a@b.co');
    expect(fromAddressOf('no address')).toBeNull();
    expect(fromAddressOf(null)).toBeNull();
  });
});
