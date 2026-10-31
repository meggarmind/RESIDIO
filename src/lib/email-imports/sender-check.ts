/**
 * Sender check for bank alerts (#1340, hardened in #1353). Anyone who knows the app's Gmail
 * address can send it a false alert, so the scheduled run records a payment only when Gmail's own
 * authentication of the message proves FirstBank sent it. The owner's set-up is a Gmail filter
 * auto-forward, which keeps FirstBank's From and DKIM signature. All of these must hold:
 *
 * - The topmost Authentication-Results header has the authserv-id `mx.google.com`. Gmail prepends
 *   its header on delivery; a sender can put any header lower down, so a lower one is never read,
 *   even when the top one is malformed.
 * - In it: `dkim=pass` with `header.d` (or the domain of `header.i`) at firstbanknigeria.com or a
 *   subdomain, and `dmarc=pass` with `header.from=firstbanknigeria.com`. SPF is not used: after a
 *   forward it is the forwarder's SPF that passes.
 * - The From header is exactly one address, at firstbanknigeria.com or a subdomain.
 *
 * The header is parsed per RFC 8601: a ';' or ')' inside a quoted string or a (nested) comment
 * splits nothing, and a sender controls some quoted values in Gmail's header (smtp.mailfrom). A
 * malformed value or a property repeated within one result fails the check.
 *
 * A manual forward (From is the estate mailbox) is not verified: anyone who can send from that
 * mailbox could write any alert text. It is queued for review. X-Forwarded-For/To can be forged and
 * are not used.
 *
 * Pure function, no 'use server'.
 */

// The Gmail search default only (gmail-client.ts). Trust comes from FIRST_BANK_DKIM_DOMAIN alone:
// firstbank.com is not FirstBank Nigeria's alert domain.
export const FIRST_BANK_SENDERS = [
  'firstbanknigeria.com',
  'firstbank.com',
  'alert@firstbanknigeria.com',
  'noreply@firstbanknigeria.com',
];

/** The only domain whose DKIM signature, DMARC result and From address are trusted. */
export const FIRST_BANK_DKIM_DOMAIN = 'firstbanknigeria.com';

const GMAIL_AUTHSERV_ID = 'mx.google.com';

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

/** A word of the header, and where its first quoted text starts (-1 for none). */
interface Word {
  text: string;
  quotedFrom: number;
}

const domainOf = (value: string) => value.slice(value.lastIndexOf('@') + 1).toLowerCase();

const isFirstBankDomain = (domain: string) =>
  domain === FIRST_BANK_DKIM_DOMAIN || domain.endsWith(`.${FIRST_BANK_DKIM_DOMAIN}`);

const fail = (detail: string): SenderCheck => ({ verified: false, detail });

/**
 * Split an Authentication-Results value into its ';'-separated parts, each a list of words.
 * Quoted strings (with backslash escapes) and nested comments separate nothing; comments are
 * dropped. Returns null on an unterminated quote or comment.
 */
function tokenize(value: string): Word[][] | null {
  const segments: Word[][] = [[]];
  let word = '';
  let quotedFrom = -1;
  let inQuote = false;
  let depth = 0;
  const endWord = () => {
    if (word || quotedFrom >= 0) segments[segments.length - 1].push({ text: word, quotedFrom });
    word = '';
    quotedFrom = -1;
  };
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < value.length) word += value[++i];
      else if (ch === '"') inQuote = false;
      else word += ch;
    } else if (depth > 0) {
      if (ch === '\\') i++;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
    } else if (ch === '"') {
      inQuote = true;
      if (quotedFrom < 0) quotedFrom = word.length;
    } else if (ch === '(') {
      endWord();
      depth = 1;
    } else if (ch === ';') {
      endWord();
      segments.push([]);
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word += ch;
    }
  }
  if (inQuote || depth > 0) return null;
  endWord();
  return segments;
}

type Parsed =
  | { ok: true; authservId: string; results: AuthResult[] }
  | { ok: false; detail: string };

function parseAuthenticationResults(value: string): Parsed {
  const malformed = { ok: false as const, detail: 'Authentication-Results is malformed' };
  const segments = tokenize(value);
  if (!segments) return malformed;
  const [authserv, ...rest] = segments;
  // Quoted text may be a property value, never an authserv-id, a method, a result or a name.
  if (authserv.length === 0 || authserv[0].quotedFrom >= 0) return malformed;

  const results: AuthResult[] = [];
  for (const words of rest) {
    if (words.length === 0) continue;
    const head = words[0].quotedFrom < 0 ? words[0].text.match(/^([a-z0-9_.-]+)=([a-z0-9_-]+)$/i) : null;
    if (!head) {
      // A part that names no method=result is not RFC 8601; "none" alone is the only legal form.
      if (words.length === 1 && words[0].quotedFrom < 0 && words[0].text.toLowerCase() === 'none') continue;
      return malformed;
    }
    const props: Record<string, string> = {};
    for (const w of words.slice(1)) {
      const prop = w.text.match(/^([a-z0-9_-]+\.[a-z0-9_.-]+)=(.*)$/i);
      if (!prop || (w.quotedFrom >= 0 && w.quotedFrom <= prop[1].length)) continue;
      const key = prop[1].toLowerCase();
      // The same property twice in one result (two header.d=) is ambiguous.
      if (key in props) return { ok: false, detail: `Authentication-Results repeats ${key} in one result` };
      props[key] = prop[2].toLowerCase();
    }
    results.push({ method: head[1].toLowerCase(), result: head[2].toLowerCase(), props });
  }
  return { ok: true, authservId: authserv[0].text.toLowerCase(), results };
}

/** The signing domain of a DKIM result: header.d, else the domain part of header.i. */
function dkimDomain(result: AuthResult): string | null {
  const d = result.props['header.d'];
  if (d) return d;
  const i = result.props['header.i'];
  return i ? domainOf(i) || null : null;
}

const SINGLE_ADDRESS = /^[^@\s<>,;:"()[\]\\]+@[^@\s<>,;:"()[\]\\]+$/;

/**
 * The bare, lower-cased address of a From header with exactly one address: `Name <a@b.com>` or
 * `a@b.com`. Lists, groups, several `<...>`, quoted local parts and `<x@evil.com@bank.com>` give null.
 */
export function fromAddressOf(from: string | null | undefined): string | null {
  const value = (from ?? '').trim();
  const bracketed = value.match(/^([^<>@,]*)<([^<>]*)>$/);
  const address = bracketed ? bracketed[2].trim() : value;
  return SINGLE_ADDRESS.test(address) ? address.toLowerCase() : null;
}

export function checkAlertSender(
  headers: Header[] | null | undefined,
  fromHeader: string | null | undefined
): SenderCheck {
  const all = headers ?? [];
  // Only the topmost header: Gmail's. A lower one is never a fallback.
  const top = all.find((h) => h.name?.toLowerCase() === 'authentication-results');
  if (!top?.value) return fail('No Authentication-Results header');

  const parsed = parseAuthenticationResults(top.value);
  if (!parsed.ok) return fail(parsed.detail);
  if (parsed.authservId !== GMAIL_AUTHSERV_ID) return fail('Authentication-Results is not from mx.google.com');

  if (all.filter((h) => h.name?.toLowerCase() === 'from').length > 1) return fail('More than one From header');
  const from = fromAddressOf(fromHeader);
  if (!from) return fail('From is not exactly one address');
  if (!isFirstBankDomain(domainOf(from))) return fail(`Manual forward: not a FirstBank-signed alert (From ${from})`);

  const bankDkim = parsed.results.filter((r) => {
    const domain = r.method === 'dkim' ? dkimDomain(r) : null;
    return !!domain && isFirstBankDomain(domain);
  });
  const dmarcResults = parsed.results.filter((r) => r.method === 'dmarc');
  // A FirstBank DKIM pass next to a non-pass for the same domain, or two DMARC results: ambiguous.
  const dkimConflict = bankDkim.some(
    (r) => r.result !== 'pass' && bankDkim.some((p) => p.result === 'pass' && dkimDomain(p) === dkimDomain(r))
  );
  if (dkimConflict || dmarcResults.length > 1) return fail('Authentication-Results has conflicting results');

  const dkimPass = bankDkim.find((r) => r.result === 'pass');
  if (!dkimPass) return fail(`No dkim=pass for ${FIRST_BANK_DKIM_DOMAIN}`);

  const dmarc = dmarcResults[0];
  if (dmarc?.result !== 'pass' || dmarc.props['header.from'] !== FIRST_BANK_DKIM_DOMAIN) {
    return fail(`No dmarc=pass header.from=${FIRST_BANK_DKIM_DOMAIN}`);
  }

  return {
    verified: true,
    detail: `dkim=pass header.d=${dkimDomain(dkimPass)}; dmarc=pass header.from=${FIRST_BANK_DKIM_DOMAIN}; From ${from}`,
  };
}
