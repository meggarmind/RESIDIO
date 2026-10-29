import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// waha-sessions-backup.sh against stub docker / age / rclone / curl on PATH. rclone is backed by a
// directory standing in for the bucket, so uploads, listings and deletes are real file operations.
// Nothing touches the network, docker or R2.

const SCRIPT = resolve('scripts/backup/waha-sessions-backup.sh');
const SECRET = 'SECRET-7c1e9a';
const WEBHOOK = 'https://discord.example.com/api/webhooks/123/WEBHOOK-TOKEN-5d2b';
const UUID = 'kcaayyjlk7mxojspks56ziwe';

const day = new Date().toISOString().slice(0, 10);
const month = day.slice(0, 7);

const STUBS: Record<string, string> = {
  docker: `#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
if [ "$1" = ps ]; then
  [ -z "\${STUB_CONTAINER:-}" ] || echo "$STUB_CONTAINER"
  exit 0
fi
if [ "$1" = exec ]; then
  printf '%s' 'tar-bytes-PLAINTEXT-MARKER-91f3'
  exit "\${STUB_TAR_EXIT:-0}"
fi
exit 0
`,
  age: `#!/usr/bin/env bash
echo "age $*" >> "$STUB_LOG"
out=""
while [ $# -gt 0 ]; do
  if [ "$1" = --output ]; then out="$2"; shift; fi
  shift
done
if [ -n "\${STUB_AGE_EMPTY:-}" ]; then cat > /dev/null; : > "$out"; exit 0; fi
[ -z "\${STUB_AGE_FAIL:-}" ] || { cat > /dev/null; exit 1; }
# Stand-in for encryption: base64, so plaintext is distinguishable from the "encrypted" output.
base64 -w0 > "$out"
# By now any plaintext copy written upstream (tee, redirect) would exist: record where.
grep -rl PLAINTEXT-MARKER-91f3 "$TMPDIR" 2>/dev/null >> "$STUB_LEAK_LOG" || true
`,
  rclone: `#!/usr/bin/env bash
echo "rclone $*" >> "$STUB_LOG"
path() { echo "$STUB_REMOTE/\${1#R2:}"; }
case "$1" in
  copyto) mkdir -p "$(dirname "$(path "$3")")"; cp "$(case "$2" in R2:*) path "$2";; *) echo "$2";; esac)" "$(path "$3")" ;;
  size)
    if [ -n "\${STUB_REMOTE_SIZE:-}" ]; then echo "{\\"count\\":1,\\"bytes\\":$STUB_REMOTE_SIZE}"; exit 0; fi
    echo "{\\"count\\":1,\\"bytes\\":$(stat -c %s "$(path "$3")")}" ;;
  lsf) [ -z "\${STUB_LSF_FAIL:-}" ] || exit 4
       d="$(path "$2")"; [ -d "$d" ] && ls -1 "$d" || true ;;
  deletefile) rm -f "$(path "$2")" ;;
esac
`,
  curl: `#!/usr/bin/env bash
echo "curl $*" >> "$STUB_LOG"
echo "call" >> "$STUB_CURL_CALLS"
while [ $# -gt 0 ]; do
  case "$1" in
    --config) cat "$2" >> "$STUB_CURL_CONFIG"; shift ;;
    -d) printf '%s\\n' "$2" >> "$STUB_CURL_BODY"; shift ;;
  esac
  shift
done
`,
};

type Ctx = { root: string; remote: string; log: string };
const roots: string[] = [];

function setup(opts: { envMode?: number; envLines?: string[]; webhook?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'waha-backup-'));
  roots.push(root);
  const bin = join(root, 'bin');
  const remote = join(root, 'remote');
  mkdirSync(bin);
  mkdirSync(remote);
  mkdirSync(join(root, 'tmp'));
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const envFile = join(root, 'waha-stage.env');
  const lines = opts.envLines ?? [
    'R2_ENDPOINT=https://acct.r2.example.com',
    `R2_ACCESS_KEY_ID=${SECRET}`,
    `R2_SECRET_ACCESS_KEY=${SECRET}`,
    'R2_BUCKET=bucket',
    `BACKUP_AGE_PUBLIC_KEY=age1${SECRET}`,
  ];
  writeFileSync(envFile, lines.join('\n') + '\n');
  chmodSync(envFile, opts.envMode ?? 0o600);
  const webhookFile = join(root, 'discord-webhook');
  if (opts.webhook !== false) writeFileSync(webhookFile, WEBHOOK + '\n');
  const log = join(root, 'calls.log');
  writeFileSync(log, '');
  for (const f of ['curl-calls.log', 'curl-config.log', 'curl-body.log']) writeFileSync(join(root, f), '');
  const base: Record<string, string> = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    TMPDIR: join(root, 'tmp'),
    WAHA_BACKUP_ENV_FILE: envFile,
    WAHA_BACKUP_DISCORD_WEBHOOK_FILE: webhookFile,
    STUB_LOG: log,
    STUB_LEAK_LOG: join(root, 'leaks.log'),
    STUB_REMOTE: remote,
    STUB_CONTAINER: `${UUID}-123456789`,
    STUB_CURL_CALLS: join(root, 'curl-calls.log'),
    STUB_CURL_CONFIG: join(root, 'curl-config.log'),
    STUB_CURL_BODY: join(root, 'curl-body.log'),
  };
  const ctx: Ctx = { root, remote, log };
  return { ctx, base, envFile };
}

const run = (env: Record<string, string>, args: string[] = ['stage']) =>
  spawnSync('bash', [SCRIPT, ...args], { env, encoding: 'utf8' });

const read = (ctx: Ctx, f: string) => readFileSync(join(ctx.root, f), 'utf8');
const curlCalls = (ctx: Ctx) => read(ctx, 'curl-calls.log').split('\n').filter(Boolean).length;
const bucketDir = (ctx: Ctx, sub: string) => join(ctx.remote, 'bucket', 'waha', 'stage', sub);
const seed = (ctx: Ctx, sub: string, names: string[]) => {
  mkdirSync(bucketDir(ctx, sub), { recursive: true });
  for (const n of names) writeFileSync(join(bucketDir(ctx, sub), n), 'old');
};
const ls = (ctx: Ctx, sub: string) => (existsSync(bucketDir(ctx, sub)) ? readdirSync(bucketDir(ctx, sub)).sort() : []);

function expectAlertedFailure(ctx: Ctx, r: ReturnType<typeof run>, step?: string) {
  expect(r.status).not.toBe(0);
  expect(curlCalls(ctx)).toBe(1);
  const body = read(ctx, 'curl-body.log');
  expect(body).toContain('WAHA stage backup failed');
  if (step) expect(body).toContain(step);
  // The URL goes in via --config, never argv; no secret reaches the output.
  expect(read(ctx, 'curl-config.log')).toContain(WEBHOOK);
  expect(read(ctx, 'calls.log')).not.toContain(WEBHOOK);
  const output = r.stdout + r.stderr;
  expect(output).not.toContain(WEBHOOK);
  expect(output).not.toContain('WEBHOOK-TOKEN');
  expect(output).not.toContain(SECRET);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('waha-sessions-backup.sh', () => {
  it('uploads the encrypted archive, checks the size and writes the monthly copy', () => {
    const { ctx, base } = setup();
    const r = run(base);
    expect(r.status, r.stderr).toBe(0);
    expect(ls(ctx, 'daily')).toEqual([`${day}.tar.gz.age`]);
    expect(ls(ctx, 'monthly')).toEqual([`${month}.tar.gz.age`]);
    const log = read(ctx, 'calls.log');
    expect(log).toContain(`docker ps --filter name=^${UUID}- --format {{.Names}}`);
    expect(log).toContain(`docker exec ${UUID}-123456789 tar --warning=no-file-changed -C /app -czf - .sessions`);
    expect(log).toContain(`age --recipient age1${SECRET} --output`);
    expect(log).toContain(`R2:bucket/waha/stage/daily/${day}.tar.gz.age`);
    expect(log).toContain(`rclone size --json R2:bucket/waha/stage/daily/${day}.tar.gz.age`);
    expect(readFileSync(join(bucketDir(ctx, 'daily'), `${day}.tar.gz.age`), 'utf8')).toBe(Buffer.from('tar-bytes-PLAINTEXT-MARKER-91f3').toString('base64'));
    expect(curlCalls(ctx)).toBe(0);
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  it('does not overwrite a monthly copy that already exists', () => {
    const { ctx, base } = setup();
    seed(ctx, 'monthly', [`${month}.tar.gz.age`]);
    const r = run(base);
    expect(r.status, r.stderr).toBe(0);
    expect(read(ctx, 'calls.log')).not.toContain('monthly/' + month + '.tar.gz.age R2:');
    expect(readFileSync(join(bucketDir(ctx, 'monthly'), `${month}.tar.gz.age`), 'utf8')).toBe('old');
  });

  it('prunes to the newest 30 daily and 12 monthly, deleting the oldest', () => {
    const { ctx, base } = setup();
    const dailies = Array.from({ length: 35 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}.tar.gz.age`);
    const monthlies = Array.from({ length: 14 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}.tar.gz.age`);
    seed(ctx, 'daily', dailies);
    seed(ctx, 'monthly', [...monthlies, `${month}.tar.gz.age`]);
    const r = run(base);
    expect(r.status, r.stderr).toBe(0);
    const d = ls(ctx, 'daily');
    expect(d).toHaveLength(30);
    expect(d).toContain(`${day}.tar.gz.age`);
    expect(d).not.toContain(dailies[0]);
    const m = ls(ctx, 'monthly');
    expect(m).toHaveLength(12);
    expect(m).toContain(`${month}.tar.gz.age`);
    expect(m).not.toContain(monthlies[0]);
  });

  it('honours KEEP_DAILY', () => {
    const { ctx, base } = setup();
    seed(ctx, 'daily', ['2025-01-01.tar.gz.age', '2025-01-02.tar.gz.age', '2025-01-03.tar.gz.age']);
    const r = run({ ...base, KEEP_DAILY: '2' });
    expect(r.status, r.stderr).toBe(0);
    expect(ls(ctx, 'daily')).toEqual(['2025-01-03.tar.gz.age', `${day}.tar.gz.age`].sort());
  });

  it('refuses a missing env file and alerts once', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, WAHA_BACKUP_ENV_FILE: join(ctx.root, 'nope.env') });
    expectAlertedFailure(ctx, r, 'reading the env file');
    expect(r.stderr).toContain('env file not found');
  });

  it('refuses an env file wider than 600', () => {
    const { ctx, base } = setup({ envMode: 0o644 });
    const r = run(base);
    expectAlertedFailure(ctx, r, 'reading the env file');
    expect(r.stderr).toContain('mode 644');
    expect(ls(ctx, 'daily')).toEqual([]);
  });

  it('fails on a missing R2 variable', () => {
    const { ctx, base } = setup({
      envLines: ['R2_ENDPOINT=https://x', `R2_ACCESS_KEY_ID=${SECRET}`, `R2_SECRET_ACCESS_KEY=${SECRET}`, `BACKUP_AGE_PUBLIC_KEY=age1${SECRET}`],
    });
    const r = run(base);
    expectAlertedFailure(ctx, r);
    expect(r.stdout + r.stderr).toContain('R2_BUCKET');
  });

  it('fails when BACKUP_AGE_PUBLIC_KEY is missing', () => {
    const { ctx, base } = setup({
      envLines: ['R2_ENDPOINT=https://x', `R2_ACCESS_KEY_ID=${SECRET}`, `R2_SECRET_ACCESS_KEY=${SECRET}`, 'R2_BUCKET=bucket'],
    });
    const r = run(base);
    expectAlertedFailure(ctx, r);
    expect(r.stdout + r.stderr).toContain('BACKUP_AGE_PUBLIC_KEY');
  });

  it('fails when no WAHA container is running', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, STUB_CONTAINER: '' });
    expectAlertedFailure(ctx, r, 'finding the WAHA container');
    expect(ls(ctx, 'daily')).toEqual([]);
  });

  it('fails when tar fails, uploading nothing', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, STUB_TAR_EXIT: '2' });
    expectAlertedFailure(ctx, r, 'archiving and encrypting');
    expect(ls(ctx, 'daily')).toEqual([]);
  });

  it('rejects an empty encrypted archive', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, STUB_AGE_EMPTY: '1' });
    expectAlertedFailure(ctx, r, 'archiving and encrypting');
    expect(ls(ctx, 'daily')).toEqual([]);
  });

  it('fails when the uploaded size differs, and does not prune or copy monthly', () => {
    const { ctx, base } = setup();
    seed(ctx, 'daily', ['2025-01-01.tar.gz.age']);
    const r = run({ ...base, STUB_REMOTE_SIZE: '1', KEEP_DAILY: '1' });
    expectAlertedFailure(ctx, r, 'verifying the uploaded size');
    expect(ls(ctx, 'daily')).toContain('2025-01-01.tar.gz.age');
    expect(ls(ctx, 'monthly')).toEqual([]);
  });

  it('refuses prod without WAHA_APP_UUID', () => {
    const { ctx, base } = setup();
    const r = run(base, ['prod']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('WAHA_APP_UUID');
    expect(read(ctx, 'calls.log')).not.toContain('docker');
  });

  it('runs prod when WAHA_APP_UUID is set and uses it to find the container', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, WAHA_APP_UUID: 'prodapp1', STUB_CONTAINER: 'prodapp1-999' }, ['prod']);
    expect(r.status, r.stderr).toBe(0);
    expect(read(ctx, 'calls.log')).toContain('name=^prodapp1-');
    expect(existsSync(join(ctx.remote, 'bucket', 'waha', 'prod', 'daily', `${day}.tar.gz.age`))).toBe(true);
  });

  it('rejects an unknown environment', () => {
    const { base } = setup();
    expect(run(base, ['dev']).status).toBe(2);
  });

  it('logs and still fails when the webhook file is missing', () => {
    const { ctx, base } = setup({ webhook: false });
    const r = run({ ...base, STUB_CONTAINER: '' });
    expect(r.status).not.toBe(0);
    expect(curlCalls(ctx)).toBe(0);
    expect(r.stdout).toContain('no Discord webhook file');
  });

  it('continues with a warning when tar exits 1 (files changed while reading)', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, STUB_TAR_EXIT: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).toContain('warning: tar reported files changing');
    expect(ls(ctx, 'daily')).toEqual([`${day}.tar.gz.age`]);
    expect(curlCalls(ctx)).toBe(0);
  });

  it('fails when tar exits 2', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, STUB_TAR_EXIT: '2' });
    expectAlertedFailure(ctx, r, 'archiving and encrypting');
    expect(r.stderr).toContain('tar failed (exit 2)');
    expect(ls(ctx, 'daily')).toEqual([]);
  });

  it('fails when age fails', () => {
    const { ctx, base } = setup();
    const r = run({ ...base, STUB_AGE_FAIL: '1' });
    expectAlertedFailure(ctx, r, 'archiving and encrypting');
    expect(ls(ctx, 'daily')).toEqual([]);
  });

  it('fails, and does not overwrite the monthly copy, when listing the monthly folder fails', () => {
    const { ctx, base } = setup();
    seed(ctx, 'monthly', [`${month}.tar.gz.age`]);
    const r = run({ ...base, STUB_LSF_FAIL: '1' });
    expectAlertedFailure(ctx, r, 'writing the monthly copy');
    expect(readFileSync(join(bucketDir(ctx, 'monthly'), `${month}.tar.gz.age`), 'utf8')).toBe('old');
  });

  it('leaves nothing in TMPDIR after a successful run or a failing one', () => {
    const ok = setup();
    expect(run(ok.base).status).toBe(0);
    expect(readdirSync(join(ok.ctx.root, 'tmp'))).toEqual([]);
    const bad = setup();
    expect(run({ ...bad.base, STUB_TAR_EXIT: '2' }).status).not.toBe(0);
    expect(readdirSync(join(bad.ctx.root, 'tmp'))).toEqual([]);
  });

  it('never writes the plaintext archive to disk', () => {
    const { ctx, base } = setup();
    const r = run(base);
    // The age stub records any file under TMPDIR holding the marker while the stream is still open.
    expect(existsSync(join(ctx.root, 'leaks.log')) ? read(ctx, 'leaks.log') : '').toBe('');
    expect(r.status, r.stderr).toBe(0);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (readFileSync(f).includes('PLAINTEXT-MARKER-91f3')) hits.push(f);
      }
    };
    walk(ctx.root);
    // The stub logs argv only; no file may hold the marker, so any hit is a leaked plaintext copy.
    expect(hits.filter((f) => !f.startsWith(join(ctx.root, 'bin')))).toEqual([]);
  });
});
