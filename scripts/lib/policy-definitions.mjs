/**
 * Pure parse/compare logic for the policy-definition baseline (#228).
 * No I/O here so it can be unit-tested; the CLI is scripts/diff-policy-definitions.mjs.
 *
 * A policy is identified by (tablename, policyname). Row order and blank lines in a
 * capture are irrelevant: policies are compared by key, never by position.
 */

export const FIELDS = ['tablename', 'policyname', 'cmd', 'permissive', 'roles', 'qualHash', 'withCheckHash'];

const HASH = /^[0-9a-f]{12}$/;
const COMPARED = ['cmd', 'permissive', 'roles', 'qualHash', 'withCheckHash'];

export class PolicyParseError extends Error {}

/** Parse one probe row. A policy name may itself contain `|`, so the five trailing fields anchor the split. */
export function parseRow(line) {
  const parts = line.split('|');
  if (parts.length < 7) throw new PolicyParseError(`malformed row (want 7 '|' fields): ${line}`);
  const tablename = parts[0];
  const [cmd, permissive, roles, qualHash, withCheckHash] = parts.slice(-5);
  const policyname = parts.slice(1, -5).join('|');
  if (!tablename || !policyname) throw new PolicyParseError(`empty table or policy name: ${line}`);
  if (!HASH.test(qualHash) || !HASH.test(withCheckHash)) {
    throw new PolicyParseError(`hash fields must be 12 hex chars: ${line}`);
  }
  if (permissive !== 'PERMISSIVE' && permissive !== 'RESTRICTIVE') {
    throw new PolicyParseError(`permissive must be PERMISSIVE or RESTRICTIVE: ${line}`);
  }
  return { tablename, policyname, cmd, permissive, roles, qualHash, withCheckHash };
}

export function formatRow(p) {
  return [p.tablename, p.policyname, p.cmd, p.permissive, p.roles, p.qualHash, p.withCheckHash].join('|');
}

function fromEntry(o) {
  if (typeof o === 'string') return parseRow(o.trim());
  if (o && typeof o === 'object' && typeof o.row === 'string') return parseRow(o.row.trim()); // raw MCP result
  if (o && typeof o === 'object' && FIELDS.every((f) => typeof o[f] === 'string')) {
    return parseRow(formatRow(o)); // re-validates the seven fields
  }
  throw new PolicyParseError(`unrecognised policy entry: ${JSON.stringify(o)}`);
}

export const keyOf = (p) => `${p.tablename}\u0000${p.policyname}`;

/**
 * Accepts: newline-separated probe rows (blank lines, CRLF and surrounding whitespace
 * tolerated); a JSON array of row strings; a JSON array of `{row}` objects (the MCP
 * result); or a baseline object / array of seven-field objects.
 * Returns policies in input order. Duplicate (table, policy) keys are an error.
 */
export function parseCapture(text) {
  if (typeof text !== 'string') throw new PolicyParseError('capture must be text');
  const trimmed = text.trim();
  if (trimmed === '') throw new PolicyParseError('capture is empty');

  let entries;
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch (e) {
      throw new PolicyParseError(`capture looks like JSON but does not parse: ${e.message}`);
    }
    entries = Array.isArray(json) ? json : json?.policies;
    if (!Array.isArray(entries)) throw new PolicyParseError('JSON capture must be an array (or have a `policies` array)');
  } else {
    entries = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '');
  }

  const policies = entries.map(fromEntry);
  if (policies.length === 0) throw new PolicyParseError('capture contains no policies');

  const seen = new Set();
  for (const p of policies) {
    const k = keyOf(p);
    if (seen.has(k)) throw new PolicyParseError(`duplicate policy in capture: ${p.tablename}.${p.policyname}`);
    seen.add(k);
  }
  return policies;
}

/** Compare baseline to fresh. `changed` lists each differing field with before/after. */
export function comparePolicies(baseline, fresh) {
  const base = new Map(baseline.map((p) => [keyOf(p), p]));
  const now = new Map(fresh.map((p) => [keyOf(p), p]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [k, p] of now) if (!base.has(k)) added.push(p);
  for (const [k, p] of base) {
    const q = now.get(k);
    if (!q) {
      removed.push(p);
      continue;
    }
    const fields = COMPARED.filter((f) => p[f] !== q[f]).map((f) => ({ field: f, from: p[f], to: q[f] }));
    if (fields.length) changed.push({ tablename: p.tablename, policyname: p.policyname, fields });
  }

  const byName = (a, b) => a.tablename.localeCompare(b.tablename) || a.policyname.localeCompare(b.policyname);
  added.sort(byName);
  removed.sort(byName);
  changed.sort(byName);

  return { added, removed, changed, diverged: added.length + removed.length + changed.length > 0 };
}
