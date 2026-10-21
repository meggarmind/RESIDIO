// Preflight for .github/workflows/backup-database.yml (#799).
//
// Fails the job before any dump step when a secret it needs is unset or has the wrong
// shape, so the log says "Secret R2_BUCKET is not set" instead of a misleading psql
// socket error. Mirrors scripts/backup-cron-preflight.mjs (#623) but fails the job: a
// silent skip would hide a missing backup, and GitHub already emails a failed scheduled run.
//
// Secret VALUES are never printed: messages carry the secret name and the rule only.
//
// Usage (CLI, driven by the workflow's env):
//   node scripts/backup/preflight.mjs <prod|stage>
// Reads the same variables the workflow maps for that job (DB_URL, R2_*, ...).

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENVIRONMENTS = ['prod', 'stage'];

// Names are the env var names the scripts read; `secret` is the repository secret behind each.
const SHARED = [
  { name: 'R2_ENDPOINT', secret: 'R2_ENDPOINT', rule: 'must start with https://' },
  { name: 'R2_ACCESS_KEY_ID', secret: 'R2_ACCESS_KEY_ID' },
  { name: 'R2_SECRET_ACCESS_KEY', secret: 'R2_SECRET_ACCESS_KEY' },
  { name: 'R2_BUCKET', secret: 'R2_BUCKET' },
  { name: 'BACKUP_AGE_PUBLIC_KEY', secret: 'BACKUP_AGE_PUBLIC_KEY', rule: 'must start with age1' },
];

const dbUrl = (secret) => ({
  name: 'DB_URL',
  secret,
  rule: 'must be a postgres:// session pooler URL on port 5432, not 6543',
});

export const REQUIRED = {
  stage: [dbUrl('STAGE_DB_URL'), ...SHARED],
  prod: [
    dbUrl('PROD_DB_URL'),
    ...SHARED,
    { name: 'STORAGE_S3_ENDPOINT', secret: 'PROD_STORAGE_S3_ENDPOINT' },
    { name: 'STORAGE_S3_REGION', secret: 'PROD_STORAGE_S3_REGION' },
    { name: 'STORAGE_S3_ACCESS_KEY_ID', secret: 'PROD_STORAGE_S3_ACCESS_KEY_ID' },
    { name: 'STORAGE_S3_SECRET_ACCESS_KEY', secret: 'PROD_STORAGE_S3_SECRET_ACCESS_KEY' },
    { name: 'FILES_CRYPT_PASSWORD', secret: 'FILES_CRYPT_PASSWORD' },
    { name: 'FILES_CRYPT_PASSWORD2', secret: 'FILES_CRYPT_PASSWORD2' },
  ],
};

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

const SHAPE = {
  R2_ENDPOINT: (v) => v.startsWith('https://'),
  BACKUP_AGE_PUBLIC_KEY: (v) => v.startsWith('age1'),
  DB_URL: (v) => {
    if (!v.startsWith('postgres')) return false;
    try {
      const { port } = new URL(v);
      return port === '' || port === '5432';
    } catch {
      return false;
    }
  },
};

/**
 * @param {string} environment prod | stage
 * @param {Record<string, string | undefined>} env
 * @returns {{ environment: string, problems: string[], ok: boolean }}
 * `problems` hold secret NAMES and rules only, never values.
 */
export function checkSecrets(environment, env) {
  const problems = [];
  for (const { name, secret, rule } of REQUIRED[environment]) {
    const value = env[name];
    if (isBlank(value)) problems.push(`Secret ${secret} is not set`);
    else if (SHAPE[name] && !SHAPE[name](value)) problems.push(`Secret ${secret} has the wrong shape: ${rule}`);
  }
  return { environment, problems, ok: problems.length === 0 };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const environment = process.argv[2];
  if (!ENVIRONMENTS.includes(environment)) {
    console.error(`::error::Usage: preflight.mjs <${ENVIRONMENTS.join('|')}>`);
    process.exit(2);
  }
  const { problems, ok } = checkSecrets(environment, process.env);
  if (ok) {
    console.log(`Backup secrets present for ${environment}.`);
  } else {
    for (const problem of problems) console.error(`::error::${problem}`);
    console.error(
      `::error::Backup for ${environment} not started. Set the secrets in Settings > Secrets and variables > Actions; see docs/deployment/hosting-plan.md, "Backups: secrets, restore runbook".`,
    );
    process.exitCode = 1;
  }
}
