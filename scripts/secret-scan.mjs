#!/usr/bin/env node
/**
 * Pre-commit secret scan over the STAGED changes only.
 *
 * Wired in by .githooks/pre-commit (enable once per clone: `npm run hooks:install`).
 *
 * Two engines, same verdict:
 *   1. gitleaks, when it is on PATH. This is the same tool and the same default ruleset as the
 *      CI secret scan in .github/workflows/security-gate.yml (pinned there at 8.21.2).
 *   2. A built-in scan of the added lines in the staged diff, when gitleaks is not installed, so a
 *      fresh clone is protected without installing anything.
 *
 * Bypass a deliberate false positive on one line with the marker `secret-scan:allow` in a comment
 * on that line. `git commit --no-verify` skips the hook entirely; CI still scans the range.
 *
 * Usage: node scripts/secret-scan.mjs
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ALLOW_MARKER = 'secret-scan:allow';

// Files whose content is high-entropy by nature or deliberately holds placeholders.
const SKIP_CONTENT = [/(^|\/)package-lock\.json$/, /\.example$/, /\.lock$/, /\.(png|jpe?g|gif|ico|pdf|woff2?|tar\.gz)$/i];

// Env files must never be staged. Examples are the documented exception.
const FORBIDDEN_FILE = /(^|\/)\.env(\.[^/]+)?$/;
const FORBIDDEN_FILE_OK = /\.(example|sample|template)$/;

const RULES = [
  { id: 'private-key', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: 'stripe-or-paystack-live-key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'resend-api-key', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/ },
  { id: 'supabase-secret-key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  {
    id: 'generic-credential-assignment',
    re: /\b[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)[A-Za-z0-9_]*["']?\s*[:=]\s*["'`]([^"'`\s${}<>]{20,})["'`]/i,
    // Skip values that are obviously placeholders or references rather than literals.
    accept: (m) => !/^(?:your|xxx|example|placeholder|changeme|process\.env|<)/i.test(m[1]),
  },
];

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}\b/g;

/** A Supabase anon key is a public JWT; only a service_role JWT is a secret. */
function serviceRoleJwt(line) {
  for (const m of line.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') return true;
    } catch {
      // not decodable, not ours to judge
    }
  }
  return false;
}

/** Scan one added line. Returns the rule ids that matched (never the matched value). */
export function scanLine(line) {
  if (line.includes(ALLOW_MARKER)) return [];
  const hits = [];
  for (const rule of RULES) {
    const m = rule.re.exec(line);
    if (m && (!rule.accept || rule.accept(m))) hits.push(rule.id);
  }
  if (serviceRoleJwt(line)) hits.push('supabase-service-role-jwt');
  return hits;
}

/**
 * Parse `git diff --cached -U0` output into findings. Only added lines are examined.
 * @returns {{file: string, line: number, rule: string}[]}
 */
export function scanDiff(diff) {
  const findings = [];
  let file = null;
  let skip = false;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw === '+++ /dev/null' ? null : raw.replace(/^\+\+\+ b\//, '');
      skip = !file || SKIP_CONTENT.some((re) => re.test(file));
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      if (!skip) for (const rule of scanLine(raw.slice(1))) findings.push({ file, line: lineNo, rule });
      lineNo += 1;
    }
  }
  return findings;
}

/** Staged paths that must not be committed at all (real env files). */
export function forbiddenFiles(paths) {
  return paths.filter((p) => FORBIDDEN_FILE.test(p) && !FORBIDDEN_FILE_OK.test(p));
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function gitleaksAvailable() {
  const r = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

function main() {
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .split('\0')
    .filter(Boolean);
  if (staged.length === 0) return 0;

  const blocked = forbiddenFiles(staged);
  if (blocked.length > 0) {
    console.error('secret-scan: refusing to commit env files:');
    for (const f of blocked) console.error(`  ${f}`);
    console.error('Unstage them (git restore --staged <file>) and keep them out of the repo.');
    return 1;
  }

  if (gitleaksAvailable()) {
    // --redact keeps the value out of the terminal. gitleaks exits 1 when it finds a leak.
    const r = spawnSync('gitleaks', ['git', '--pre-commit', '--staged', '--redact', '--no-banner'], {
      stdio: 'inherit',
    });
    if (r.status !== 0) {
      console.error('\nsecret-scan: gitleaks found a possible secret in the staged changes.');
      console.error('A real secret must be rotated, not just removed. False positive: `git commit --no-verify`.');
    }
    return r.status ?? 1;
  }

  const findings = scanDiff(git(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR']));
  if (findings.length === 0) return 0;

  console.error('secret-scan: possible secret(s) in the staged changes (values not shown):');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.rule}`);
  console.error(`\nA real secret must be rotated, not just removed. If a line is a false positive, add "${ALLOW_MARKER}"`);
  console.error('in a comment on it. Install gitleaks for the full ruleset CI uses (same engine, fewer misses).');
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main());
  } catch (err) {
    // Fail closed: a scan that could not run must not read as a clean scan.
    console.error(`secret-scan: could not run: ${err.message}`);
    process.exit(1);
  }
}
