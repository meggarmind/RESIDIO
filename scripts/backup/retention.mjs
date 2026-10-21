// Pure helpers for backup retention and bucket-size guards (#963). Called by retention.sh.
//
//   node scripts/backup/retention.mjs expired <days> [today]   stdin: `rclone lsd` output
//       prints, one per line, the dated folders strictly older than <days> days
//   node scripts/backup/retention.mjs size                     stdin: `rclone size --json` output
//       prints the bucket size; exits 1 above FAIL_BYTES, warns above WARN_BYTES
//
// `today` is YYYY-MM-DD (UTC) and exists so tests do not depend on the clock.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Decimal GB (what R2 bills by); the bucket is capped at 10 GB by the owner.
export const WARN_BYTES = 7e9;
export const FAIL_BYTES = 8.5e9;
export const DEFAULT_KEEP_DAYS = 30;

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Epoch ms of a strict YYYY-MM-DD (UTC), or null for anything else (incl. 2026-02-31). */
export function parseDay(name) {
  const m = DATE_RE.exec(name);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(ms).toISOString().slice(0, 10) === name ? ms : null;
}

/** A positive whole number of days, else null. Zero would purge every folder, so it is refused. */
export function parseKeepDays(value) {
  if (value === undefined || value === '') return DEFAULT_KEEP_DAYS;
  return /^[1-9]\d*$/.test(String(value)) ? Number(value) : null;
}

/**
 * Dated folders more than `keepDays` days older than `today`. A folder exactly `keepDays`
 * days old is kept. Names that are not a real date are never returned, so a stray folder
 * is never purged. `lsd` lines look like `-1 2026-09-01 00:00:00 -1 2026-08-15`: the name is the last token.
 */
export function expiredFolders(lsdOutput, keepDays, today) {
  const cutoff = parseDay(today) - keepDays * DAY_MS;
  return lsdOutput
    .split('\n')
    .map((line) => line.trim().split(/\s+/).pop())
    .filter((name) => {
      const day = parseDay(name ?? '');
      return day !== null && day < cutoff;
    });
}

/** @returns {{ level: 'ok' | 'warn' | 'fail', bytes: number, gb: string }} */
export function sizeVerdict(bytes) {
  const level = bytes > FAIL_BYTES ? 'fail' : bytes > WARN_BYTES ? 'warn' : 'ok';
  return { level, bytes, gb: (bytes / 1e9).toFixed(2) };
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const [command, arg, todayArg] = process.argv.slice(2);
  if (command === 'expired') {
    const days = parseKeepDays(arg);
    if (days === null) {
      console.error(`::error::DELETED_KEEP_DAYS must be a positive whole number, got "${arg}"`);
      process.exit(2);
    }
    const today = todayArg ?? new Date().toISOString().slice(0, 10);
    if (parseDay(today) === null) {
      console.error(`::error::today must be YYYY-MM-DD, got "${today}"`);
      process.exit(2);
    }
    const out = expiredFolders(await readStdin(), days, today);
    if (out.length) console.log(out.join('\n'));
  } else if (command === 'size') {
    let bytes;
    try {
      bytes = JSON.parse(await readStdin()).bytes;
    } catch {
      bytes = undefined;
    }
    if (!Number.isFinite(bytes)) {
      console.error('::error::could not read the bucket size from `rclone size --json`');
      process.exit(2);
    }
    const { level, gb } = sizeVerdict(bytes);
    const limits = `warn above ${WARN_BYTES / 1e9} GB, fail above ${FAIL_BYTES / 1e9} GB, free tier 10 GB`;
    if (level === 'fail') {
      console.error(`::error::R2 bucket holds ${gb} GB (${limits}). Prune or raise the limit: docs/deployment/hosting-plan.md "Retention and size guards".`);
      process.exit(1);
    }
    console.log(level === 'warn' ? `::warning::R2 bucket holds ${gb} GB (${limits})` : `R2 bucket holds ${gb} GB (${limits})`);
  } else {
    console.error('::error::usage: retention.mjs expired <days> [today] | size');
    process.exit(2);
  }
}
