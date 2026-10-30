/**
 * Sender check for bank alerts (#1340). Anyone who knows the app's Gmail address can send it a
 * false alert, so the scheduled run records a payment only when Gmail's own authentication of the
 * message proves where it came from:
 *
 * - FirstBank, auto-forwarded by a Gmail filter: the original From and body survive, so FirstBank's
 *   DKIM signature still passes (`dkim=pass` for a domain in FIRST_BANK_SENDERS). SPF for FirstBank
 *   fails after a forward, so it is not used.
 * - A manual forward: From is the estate mailbox, which must be an exact address in the sender
 *   list, with `dkim=pass` for its own domain or `spf=pass` for it.
 *
 * Only the topmost Authentication-Results header, added by mx.google.com on delivery, is read: a
 * sender can put any header lower down. X-Forwarded-For/To can be forged and are not used.
 *
 * Pure function, no 'use server'.
 */

// First Bank sender patterns: the Gmail search default and the DKIM domains trusted here.
export const FIRST_BANK_SENDERS = [
  'firstbanknigeria.com',
  'firstbank.com',
  'alert@firstbanknigeria.com',
  'noreply@firstbanknigeria.com',
];

export interface SenderCheck {
  verified: boolean;
  /** What passed, or why it failed; stored on the message and shown with a queued transaction. */
  detail: string;
}

type Header = { name?: string | null; value?: string | null };

interface AuthResult {
  method: string;
  result: string;
  props: Record<string, string>;
}

const domainOf = (value: string) => value.slice(value.lastIndexOf('@') + 1).toLowerCase();

const isUnder = (domain: string, parent: string) => domain === parent || domain.endsWith(`.${parent}`);

/** The bare address of a From header: `Name <a@b.com>` or `a@b.com`. */
export function fromAddressOf(from: string | null | undefined): string | null {
  if (!from) return null;
  const address = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  return address.includes('@') ? address : null;
}

function parseResults(segments: string[]): AuthResult[] {
  return segments.flatMap((segment) => {
    const clean = segment.replace(/\([^)]*\)/g, ' ').trim();
    const head = clean.match(/^([a-z]+)\s*=\s*([a-z]+)/i);
    if (!head) return [];
    const props: Record<string, string> = {};
    for (const [, key, value] of clean.matchAll(/\b((?:header|smtp)\.[a-z]+)=([^\s;]+)/gi)) {
      props[key.toLowerCase()] = value.toLowerCase();
    }
    return [{ method: head[1].toLowerCase(), result: head[2].toLowerCase(), props }];
  });
}

export function checkAlertSender(
  headers: Header[] | null | undefined,
  fromHeader: string | null | undefined,
  senderList: string[] | null | undefined
): SenderCheck {
  const authResults = (headers ?? []).find((h) => h.name?.toLowerCase() === 'authentication-results')?.value;
  if (!authResults) return { verified: false, detail: 'No Authentication-Results header' };

  const [authServ, ...segments] = authResults.split(';');
  if (authServ.trim().split(/\s+/)[0].toLowerCase() !== 'mx.google.com') {
    return { verified: false, detail: 'Authentication-Results is not from mx.google.com' };
  }

  const results = parseResults(segments);
  const dkimPassDomains = results
    .filter((r) => r.method === 'dkim' && r.result === 'pass')
    .map((r) => r.props['header.d'] ?? (r.props['header.i'] ? domainOf(r.props['header.i']) : null))
    .filter((d): d is string => !!d);

  const bankDomains = [...new Set(FIRST_BANK_SENDERS.map(domainOf))];
  const bankDomain = dkimPassDomains.find((d) => bankDomains.some((b) => isUnder(d, b)));
  if (bankDomain) return { verified: true, detail: `dkim=pass header.d=${bankDomain}` };

  const from = fromAddressOf(fromHeader);
  const forwarders = (senderList ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@') && !bankDomains.some((b) => isUnder(domainOf(s), b)));

  if (from && forwarders.includes(from)) {
    const fromDomain = domainOf(from);
    if (dkimPassDomains.includes(fromDomain)) {
      return { verified: true, detail: `dkim=pass header.d=${fromDomain} for forwarding address ${from}` };
    }
    const spf = results.find(
      (r) => r.method === 'spf' && r.result === 'pass' && [from, fromDomain].includes(domainOrAddress(r.props['smtp.mailfrom']))
    );
    if (spf) return { verified: true, detail: `spf=pass smtp.mailfrom=${from} for forwarding address ${from}` };
    return { verified: false, detail: `Forwarding address ${from} has no dkim=pass or spf=pass` };
  }

  return { verified: false, detail: 'No dkim=pass for a FirstBank domain and From is not a forwarding address' };
}

/** smtp.mailfrom can be an address or a bare domain. */
function domainOrAddress(value: string | undefined): string {
  return (value ?? '').replace(/^<|>$/g, '');
}
