/**
 * Sender check for bank alerts (#1340, hardened in #1353). Anyone who knows the app's Gmail address
 * can send it a false alert, so the scheduled run records a payment only when Gmail's own
 * authentication of the message proves FirstBank sent it. All of these must hold:
 *
 * - `dkim=pass` with `header.d` / `header.i` under firstbanknigeria.com. A Gmail filter auto-forward
 *   keeps the original From and body, so FirstBank's signature still passes. SPF for FirstBank fails
 *   after a forward, so it is not used.
 * - `dmarc=pass` with `header.from=firstbanknigeria.com`.
 * - The message has one From header holding exactly one address under firstbanknigeria.com.
 *
 * A manual forward (From is the estate mailbox) fails the From check and is queued for review.
 *
 * Only the topmost Authentication-Results header is read, and it must be added by mx.google.com:
 * Gmail prepends it on delivery, and a sender can put any header lower down. It is parsed per
 * RFC 8601 (quoted strings, nested comments); a malformed value or a repeated property fails closed,
 * never falling through to a lower header. X-Forwarded-For/To can be forged and are not used.
 *
 * Pure function, no 'use server'.
 */

// First Bank sender patterns for the Gmail search default. Only FIRST_BANK_DOMAIN is trusted here.
export const FIRST_BANK_SENDERS = [
  'firstbanknigeria.com',
  'firstbank.com',
  'alert@firstbanknigeria.com',
  'noreply@firstbanknigeria.com',
];

/** FirstBank Nigeria's alert domain: `FirstAlert@firstbanknigeria.com`, DKIM `header.i=@firstbanknigeria.com`. */
export const FIRST_BANK_DOMAIN = 'firstbanknigeria.com';

export interface SenderCheck {
  verified: boolean;
  /** What passed, or why it failed; stored on the message and shown with a queued transaction. */
  detail: string;
}

type Header = { name?: string | null; value?: string | null };

export interface AuthResult {
  method: string;
  result: string;
  props: Record<string, string>;
}

export interface AuthResultsHeader {
  authServId: string;
  results: AuthResult[];
}

class Malformed extends Error {}

const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const KEYWORD = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/i;

const isUnder = (domain: string, parent: string) => domain === parent || domain.endsWith(`.${parent}`);

/**
 * Parse one Authentication-Results value per RFC 8601. Throws Malformed on anything it cannot read
 * unambiguously: an unterminated quote or comment, a missing `=`, a repeated property.
 */
export function parseAuthResults(value: string): AuthResultsHeader {
  let pos = 0;
  const at = () => value[pos];

  // CFWS: whitespace and comments, which nest and take backslash escapes.
  const skipCfws = () => {
    for (;;) {
      while (pos < value.length && /\s/.test(at())) pos++;
      if (at() !== '(') return;
      let depth = 0;
      do {
        if (pos >= value.length) throw new Malformed('unterminated comment');
        const c = value[pos++];
        if (c === '\\') pos++;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
      } while (depth > 0);
    }
  };

  // A token or quoted-string. `withEq` lets a property value hold `=` (base64 in header.b).
  const readValue = (withEq: boolean): string => {
    if (at() === '"') {
      pos++;
      let out = '';
      for (;;) {
        if (pos >= value.length) throw new Malformed('unterminated quoted string');
        const c = value[pos++];
        if (c === '"') return out;
        if (c === '\\') {
          if (pos >= value.length) throw new Malformed('unterminated quoted string');
          out += value[pos++];
        } else out += c;
      }
    }
    const start = pos;
    while (pos < value.length && !/[\s;()"]/.test(at()) && (withEq || at() !== '=')) pos++;
    if (pos === start) throw new Malformed(`unexpected ${pos >= value.length ? 'end' : `"${at()}"`}`);
    return value.slice(start, pos);
  };

  const expect = (c: string) => {
    if (at() !== c) throw new Malformed(`expected "${c}"`);
    pos++;
  };

  skipCfws();
  const authServId = readValue(false).toLowerCase();
  skipCfws();
  if (pos < value.length && at() !== ';') {
    // authres-version
    if (!/^\d+$/.test(readValue(false))) throw new Malformed('bad version');
    skipCfws();
  }

  const results: AuthResult[] = [];
  while (pos < value.length) {
    expect(';');
    skipCfws();
    // A method-version (`dkim/1`) stays in the name, so it never matches a method checked below.
    const method = readValue(false).toLowerCase();
    skipCfws();
    if (method === 'none' && results.length === 0 && pos >= value.length) break;
    if (!KEYWORD.test(method.split('/')[0])) throw new Malformed(`bad method "${method}"`);
    expect('=');
    skipCfws();
    const result = readValue(false).toLowerCase();
    if (!KEYWORD.test(result)) throw new Malformed(`bad result "${result}"`);

    const props: Record<string, string> = {};
    for (;;) {
      skipCfws();
      if (pos >= value.length || at() === ';') break;
      const key = readValue(false).toLowerCase();
      if (key !== 'reason' && !/^[a-z0-9-]+\.[a-z0-9_.-]+$/.test(key)) throw new Malformed(`bad property "${key}"`);
      skipCfws();
      expect('=');
      skipCfws();
      const prop = readValue(key !== 'reason');
      if (key in props) throw new Malformed(`repeated ${key} in ${method}`);
      props[key] = prop.toLowerCase();
    }
    results.push({ method, result, props });
  }

  return { authServId, results };
}

/** The bare address of a From value holding exactly one mailbox, `Name <a@b.com>` or `a@b.com`; else null. */
export function fromAddressOf(from: string | null | undefined): string | null {
  if (!from) return null;
  // Drop quoted display names and comments, so a `<`, `@` or `,` inside them cannot pass as syntax.
  let bare = '';
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < from.length; i++) {
    const c = from[i];
    if (c === '\\' && (quoted || depth > 0)) i++;
    else if (quoted) quoted = c !== '"';
    else if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) return null;
      depth--;
    } else if (depth > 0) continue;
    else if (c === '"') quoted = true;
    else bare += c;
  }
  if (quoted || depth > 0 || /[,;:]/.test(bare)) return null;
  const angle = bare.match(/</g)?.length ?? 0;
  if (angle > 1) return null;
  const address = (angle === 1 ? bare.match(/^[^<>]*<([^<>]+)>\s*$/)?.[1] : bare)?.trim().toLowerCase();
  if (!address) return null;
  const parts = address.split('@');
  if (parts.length !== 2 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) || !DOMAIN.test(parts[1])) return null;
  return address;
}

/** The domain of a DKIM `header.d` or `header.i` (`[local]@domain`) value, or null if it is not one. */
function dkimDomain(value: string): string | null {
  const domain = value.slice(value.lastIndexOf('@') + 1);
  return DOMAIN.test(domain) ? domain : null;
}

export function checkAlertSender(headers: Header[] | null | undefined): SenderCheck {
  const all = headers ?? [];
  const authResults = all.find((h) => h.name?.toLowerCase() === 'authentication-results')?.value;
  if (!authResults) return { verified: false, detail: 'No Authentication-Results header' };

  let parsed: AuthResultsHeader;
  try {
    parsed = parseAuthResults(authResults);
  } catch (error) {
    if (!(error instanceof Malformed)) throw error;
    return { verified: false, detail: `Authentication-Results is malformed: ${error.message}` };
  }
  if (parsed.authServId !== 'mx.google.com') {
    return { verified: false, detail: 'Authentication-Results is not from mx.google.com' };
  }

  // Every domain a passing signature names must be FirstBank's: header.d and header.i both, if present.
  const dkim = parsed.results.find((r) => {
    if (r.method !== 'dkim' || r.result !== 'pass') return false;
    const named = ['header.d', 'header.i'].filter((k) => k in r.props).map((k) => dkimDomain(r.props[k]));
    return named.length > 0 && named.every((d) => d !== null && isUnder(d, FIRST_BANK_DOMAIN));
  });
  if (!dkim) return { verified: false, detail: `No dkim=pass for ${FIRST_BANK_DOMAIN}` };

  const dmarc = parsed.results.filter((r) => r.method === 'dmarc');
  if (dmarc.length === 0 || !dmarc.every((r) => r.result === 'pass' && r.props['header.from'] === FIRST_BANK_DOMAIN)) {
    return { verified: false, detail: `No dmarc=pass header.from=${FIRST_BANK_DOMAIN}` };
  }

  const fromHeaders = all.filter((h) => h.name?.toLowerCase() === 'from');
  const from = fromHeaders.length === 1 ? fromAddressOf(fromHeaders[0].value) : null;
  if (!from || !isUnder(from.slice(from.indexOf('@') + 1), FIRST_BANK_DOMAIN)) {
    return {
      verified: false,
      detail: `From is not one ${FIRST_BANK_DOMAIN} address (a manual forward needs review)`,
    };
  }

  const dkimDomainName = dkimDomain(dkim.props['header.d'] ?? dkim.props['header.i']);
  return {
    verified: true,
    detail: `dkim=pass header.d=${dkimDomainName}; dmarc=pass header.from=${FIRST_BANK_DOMAIN}; from=${from}`,
  };
}
