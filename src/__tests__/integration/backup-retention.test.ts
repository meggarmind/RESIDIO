import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { expiredFolders, FAIL_BYTES, parseKeepDays, sizeVerdict, WARN_BYTES } from '../../../scripts/backup/retention.mjs';

const lsd = (...names: string[]) => names.map((n) => `          -1 2026-09-01 00:00:00        -1 ${n}`).join('\n');

describe('expiredFolders', () => {
  it('purges folders strictly older than the keep window and keeps the boundary day', () => {
    // today 2026-10-21, keep 30 => cutoff 2026-09-21: 09-20 goes, 09-21 stays.
    expect(expiredFolders(lsd('2026-09-19', '2026-09-20', '2026-09-21', '2026-10-21'), 30, '2026-10-21')).toEqual([
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('honours a different keep window', () => {
    expect(expiredFolders(lsd('2026-10-13', '2026-10-14'), 7, '2026-10-21')).toEqual(['2026-10-13']);
  });

  it('crosses month and year boundaries', () => {
    expect(expiredFolders(lsd('2025-12-01', '2025-12-02'), 30, '2026-01-01')).toEqual(['2025-12-01']);
  });

  it('never returns names that are not a real date', () => {
    expect(expiredFolders(lsd('2020-02-31', 'old', '2020-1-1', '20200101'), 30, '2026-10-21')).toEqual([]);
  });

  it('copes with empty listings', () => {
    expect(expiredFolders('', 30, '2026-10-21')).toEqual([]);
  });
});

describe('parseKeepDays', () => {
  it('defaults to 30 and accepts positive integers', () => {
    expect(parseKeepDays(undefined)).toBe(30);
    expect(parseKeepDays('')).toBe(30);
    expect(parseKeepDays('14')).toBe(14);
  });

  it.each(['0', '-3', '1.5', 'abc', '30d'])('refuses %j rather than purging everything', (v) => {
    expect(parseKeepDays(v)).toBeNull();
  });
});

describe('sizeVerdict', () => {
  it('is ok up to and including 7 GB, warns above it, fails above 8.5 GB', () => {
    expect(sizeVerdict(0).level).toBe('ok');
    expect(sizeVerdict(WARN_BYTES).level).toBe('ok');
    expect(sizeVerdict(WARN_BYTES + 1).level).toBe('warn');
    expect(sizeVerdict(FAIL_BYTES).level).toBe('warn');
    expect(sizeVerdict(FAIL_BYTES + 1).level).toBe('fail');
  });
});

const cli = (args: string[], input: string) =>
  spawnSync('node', ['scripts/backup/retention.mjs', ...args], { input, encoding: 'utf8' });

describe('retention.mjs CLI', () => {
  it('size: prints, warns and fails with the right exit codes', () => {
    const ok = cli(['size'], '{"count":3,"bytes":1000000000,"sizeless":0}');
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('1.00 GB');
    const warn = cli(['size'], '{"count":3,"bytes":7500000000,"sizeless":0}');
    expect(warn.status).toBe(0);
    expect(warn.stdout).toContain('::warning::');
    const fail = cli(['size'], '{"count":3,"bytes":9000000000,"sizeless":0}');
    expect(fail.status).toBe(1);
    expect(fail.stderr).toContain('::error::');
  });

  it('size: unreadable input fails instead of passing silently', () => {
    expect(cli(['size'], 'not json').status).toBe(2);
    expect(cli(['size'], '{}').status).toBe(2);
  });

  it('expired: rejects a bad keep value', () => {
    expect(cli(['expired', '0', '2026-10-21'], lsd('2020-01-01')).status).toBe(2);
  });
});

// retention.sh against a stub rclone: nothing touches a real bucket.
const stubDir = mkdtempSync(join(tmpdir(), 'rclone-stub-'));
afterAll(() => rmSync(stubDir, { recursive: true, force: true }));

function runShell(fn: string, stub: string, env: Record<string, string> = {}) {
  const calls = join(stubDir, 'calls.log');
  writeFileSync(calls, '');
  writeFileSync(join(stubDir, 'rclone'), `#!/usr/bin/env bash\necho "$*" >> "${calls}"\n${stub}\n`);
  chmodSync(join(stubDir, 'rclone'), 0o755);
  const r = spawnSync('bash', ['-c', `set -euo pipefail; . scripts/backup/retention.sh; ${fn}`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, R2_BUCKET: 'bucket-x', ...env },
  });
  return { ...r, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean) };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('purge_old_deleted', () => {
  const listing = `${lsd(daysAgo(45), daysAgo(31), daysAgo(29), daysAgo(1))}`;
  const stub = (l: string) => `if [ "$1" = lsd ]; then cat <<'EOT'\n${l}\nEOT\nfi`;

  it('purges only the folders older than 30 days by default', () => {
    const r = runShell('purge_old_deleted', stub(listing));
    expect(r.status).toBe(0);
    expect(r.calls).toEqual([
      'lsd FILESCRYPT:deleted',
      `purge FILESCRYPT:deleted/${daysAgo(45)}`,
      `purge FILESCRYPT:deleted/${daysAgo(31)}`,
    ]);
  });

  it('reads the day count from DELETED_KEEP_DAYS', () => {
    const r = runShell('purge_old_deleted', stub(listing), { DELETED_KEEP_DAYS: '10' });
    expect(r.calls.filter((c) => c.startsWith('purge'))).toHaveLength(3);
  });

  it('treats a missing deleted/ directory (rclone exit 3) as nothing to do', () => {
    const r = runShell('purge_old_deleted', 'if [ "$1" = lsd ]; then exit 3; fi');
    expect(r.status).toBe(0);
    expect(r.calls).toEqual(['lsd FILESCRYPT:deleted']);
  });

  it('fails on any other rclone error', () => {
    expect(runShell('purge_old_deleted', 'if [ "$1" = lsd ]; then exit 1; fi').status).toBe(1);
  });

  it('refuses a zero day count and purges nothing', () => {
    const r = runShell('purge_old_deleted', stub(listing), { DELETED_KEEP_DAYS: '0' });
    expect(r.status).not.toBe(0);
    expect(r.calls.some((c) => c.startsWith('purge'))).toBe(false);
  });
});

describe('check_bucket_size', () => {
  const sized = (bytes: number) => `echo '{"count":1,"bytes":${bytes},"sizeless":0}'`;

  it('measures the whole bucket and passes when small', () => {
    const r = runShell('check_bucket_size', sized(2e9));
    expect(r.status).toBe(0);
    expect(r.calls).toEqual(['size R2:bucket-x --json']);
  });

  it('fails the job above 8.5 GB', () => {
    expect(runShell('check_bucket_size', sized(8.6e9)).status).toBe(1);
  });

  it('fails when rclone itself fails', () => {
    expect(runShell('check_bucket_size', 'exit 1').status).not.toBe(0);
  });
});
