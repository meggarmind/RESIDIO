import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// db-backup.sh against stub pg_dump / pg_restore / age / rclone on PATH. rclone is backed by a
// directory standing in for the bucket. STUB_LSF_FAIL_ON makes the listing of one prefix fail.

const SCRIPT = resolve('scripts/backup/db-backup.sh');
const day = new Date().toISOString().slice(0, 10);
const month = day.slice(0, 7);

const STUBS: Record<string, string> = {
  pg_dump: `#!/usr/bin/env bash
for a in "$@"; do case "$a" in --file=*) echo dump > "\${a#--file=}" ;; esac; done
`,
  pg_restore: `#!/usr/bin/env bash
echo "entry"
`,
  age: `#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do [ "$1" = --output ] && { out="$2"; shift; }; shift; done
echo enc > "$out"
`,
  rclone: `#!/usr/bin/env bash
path() { echo "$STUB_REMOTE/\${1#R2:}"; }
case "$1" in
  copyto) mkdir -p "$(dirname "$(path "$3")")"; cp "$(case "$2" in R2:*) path "$2";; *) echo "$2";; esac)" "$(path "$3")" ;;
  size)
    if [ "$2" = --json ]; then echo "{\\"count\\":1,\\"bytes\\":$(stat -c %s "$(path "$3")")}"; else echo '{"count":1,"bytes":1000}'; fi ;;
  lsf)
    case "$2" in *"/\${STUB_LSF_FAIL_ON:-NONE}/") exit "\${STUB_LSF_RC:-4}" ;; esac
    d="$(path "$2")"; [ -d "$d" ] && ls -1 "$d" || exit "\${STUB_LSF_MISSING_RC:-0}" ;;
  deletefile) rm -f "$(path "$2")" ;;
esac
`,
};

const roots: string[] = [];

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'db-backup-'));
  roots.push(root);
  const bin = join(root, 'bin');
  const remote = join(root, 'remote');
  mkdirSync(bin);
  mkdirSync(remote);
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const env: Record<string, string> = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    TMPDIR: root,
    STUB_REMOTE: remote,
    R2_ENDPOINT: 'https://acct.r2.example.com',
    R2_ACCESS_KEY_ID: 'k',
    R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKET: 'bucket',
    DB_URL: 'postgres://u:p@h/db',
    BACKUP_AGE_PUBLIC_KEY: 'age1x',
    KEEP_DAILY: '2',
    KEEP_MONTHLY: '2',
  };
  const dir = (sub: string) => join(remote, 'bucket', 'db', 'stage', sub);
  const seed = (sub: string, names: string[]) => {
    mkdirSync(dir(sub), { recursive: true });
    for (const n of names) writeFileSync(join(dir(sub), n), 'old');
  };
  const ls = (sub: string) => (existsSync(dir(sub)) ? readdirSync(dir(sub)).sort() : []);
  return { env, seed, ls };
}

const run = (env: Record<string, string>) =>
  spawnSync('bash', [SCRIPT, 'stage'], { env: env as unknown as NodeJS.ProcessEnv, encoding: 'utf8' });

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('db-backup.sh prune listing', () => {
  it('prunes the oldest dumps beyond the keep count', () => {
    const { env, seed, ls } = setup();
    seed('daily', ['2020-01-01.dump.age', '2020-01-02.dump.age', '2020-01-03.dump.age']);
    const r = run(env);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(ls('daily')).toEqual(['2020-01-03.dump.age', `${day}.dump.age`].sort());
  });

  it('fails the job when only the daily prune listing fails', () => {
    const { env, seed, ls } = setup();
    seed('daily', ['2020-01-01.dump.age', '2020-01-02.dump.age', '2020-01-03.dump.age']);
    const r = run({ ...env, STUB_LSF_FAIL_ON: 'daily' });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('rclone lsf failed (exit 4)');
    expect(r.stdout).not.toContain('nothing to prune');
    expect(ls('daily')).toContain('2020-01-01.dump.age');
  });

  it('fails the job when only the monthly prune listing fails', () => {
    const { env, seed } = setup();
    seed('monthly', [`${month}.dump.age`]);
    const r = run({ ...env, STUB_LSF_FAIL_ON: 'monthly' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('monthly: 1 kept, nothing to prune');
  });

  it('treats a missing prefix (rclone exit 3) as empty', () => {
    const { env, ls } = setup();
    const r = run({ ...env, STUB_LSF_MISSING_RC: '3' });
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(ls('monthly')).toEqual([`${month}.dump.age`]);
    expect(readFileSync(SCRIPT, 'utf8')).toContain('list_dir');
  });
});
