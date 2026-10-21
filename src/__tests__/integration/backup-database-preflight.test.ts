import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkSecrets, REQUIRED } from '../../../scripts/backup/preflight.mjs';

const SENTINEL = 'SENTINEL-4f9a1c';
const values: Record<string, string> = {
  DB_URL: `postgresql://u:${SENTINEL}@pooler.example.com:5432/postgres`,
  R2_ENDPOINT: `https://${SENTINEL}.r2.example.com`,
  R2_ACCESS_KEY_ID: SENTINEL,
  R2_SECRET_ACCESS_KEY: SENTINEL,
  R2_BUCKET: SENTINEL,
  BACKUP_AGE_PUBLIC_KEY: `age1${SENTINEL}`,
  STORAGE_S3_ENDPOINT: SENTINEL,
  STORAGE_S3_REGION: SENTINEL,
  STORAGE_S3_ACCESS_KEY_ID: SENTINEL,
  STORAGE_S3_SECRET_ACCESS_KEY: SENTINEL,
  FILES_CRYPT_PASSWORD: SENTINEL,
  FILES_CRYPT_PASSWORD2: SENTINEL,
};
const envFor = (environment: 'prod' | 'stage') =>
  Object.fromEntries(REQUIRED[environment].map(({ name }: { name: string }) => [name, values[name]]));

describe('checkSecrets', () => {
  it.each(['prod', 'stage'] as const)('is ok when all are set (%s)', (environment) => {
    expect(checkSecrets(environment, envFor(environment))).toEqual({ environment, problems: [], ok: true });
  });

  it('names the one missing secret by its repository secret name', () => {
    const env = envFor('prod');
    delete env.DB_URL;
    expect(checkSecrets('prod', env).problems).toEqual(['Secret PROD_DB_URL is not set']);
    expect(checkSecrets('stage', { ...envFor('stage'), R2_BUCKET: '' }).problems).toEqual([
      'Secret R2_BUCKET is not set',
    ]);
  });

  it('names every missing secret, treating whitespace as unset', () => {
    const { problems } = checkSecrets('prod', { ...envFor('prod'), R2_BUCKET: '  ', FILES_CRYPT_PASSWORD2: undefined, STORAGE_S3_REGION: '' });
    expect(problems).toEqual([
      'Secret R2_BUCKET is not set',
      'Secret PROD_STORAGE_S3_REGION is not set',
      'Secret FILES_CRYPT_PASSWORD2 is not set',
    ]);
  });

  it('stage does not require the prod-only secrets', () => {
    expect(checkSecrets('stage', envFor('stage')).ok).toBe(true);
    expect(REQUIRED.stage).toHaveLength(6);
    expect(REQUIRED.prod).toHaveLength(12);
  });

  it('never puts a value in a problem message', () => {
    const { problems } = checkSecrets('stage', { ...envFor('stage'), R2_BUCKET: '', R2_ENDPOINT: SENTINEL });
    expect(problems).toEqual(['Secret R2_BUCKET is not set']);
    expect(problems.join('\n')).not.toContain(SENTINEL);
  });
});

describe('preflight CLI', () => {
  const script = 'scripts/backup/preflight.mjs';

  it('exits non-zero, names the secret, and prints no value', () => {
    const r = spawnSync('node', [script, 'stage'], {
      env: { ...envFor('stage'), R2_BUCKET: '', PATH: process.env.PATH },
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Secret R2_BUCKET is not set');
    expect(r.stdout + r.stderr).not.toContain(SENTINEL);
  });

  it('exits zero when everything is set', () => {
    const out = execFileSync('node', [script, 'prod'], { env: { ...envFor('prod'), PATH: process.env.PATH }, encoding: 'utf8' });
    expect(out).toContain('Backup secrets present for prod');
    expect(out).not.toContain(SENTINEL);
  });

  it('rejects an unknown environment', () => {
    expect(spawnSync('node', [script, 'dev'], { encoding: 'utf8' }).status).toBe(2);
  });
});
