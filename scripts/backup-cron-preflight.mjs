// Preflight for .github/workflows/backup-cron-invoices.yml (#623).
//
// Decides whether the backup invoice cron may run against one environment. It
// needs APP_URL (an https origin, no path) and CRON_SECRET. When either is
// missing the workflow skips the environment and this script emails the
// sys_admin through Resend, because the app cannot send the alert when its own
// URL/secret are the missing parameters.
//
// Secret VALUES are never printed and never put in the email: only names.
//
// Usage (CLI, driven by the workflow's env):
//   node scripts/backup-cron-preflight.mjs <environment>
// Reads APP_URL, CRON_SECRET, ALERT_RESEND_API_KEY, ALERT_EMAIL_FROM,
// ALERT_EMAIL_TO. Writes ok=true|false and missing=<names> to $GITHUB_OUTPUT.

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENVIRONMENTS = ['stage', 'production'];
export const REQUIRED_PARAMETERS = ['APP_URL', 'CRON_SECRET'];
export const ALERT_PARAMETERS = ['ALERT_RESEND_API_KEY', 'ALERT_EMAIL_FROM', 'ALERT_EMAIL_TO'];
export const RESEND_URL = 'https://api.resend.com/emails';

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

/** True when value is an https origin with no path, query or fragment. */
export function isHttpsOrigin(value) {
  if (isBlank(value)) return false;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname !== '' &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    // Belt and braces: nothing may follow the host's optional trailing slash.
    !/^https:\/\/[^/]+\/.+/.test(value.trim())
  );
}

/**
 * @param {string} environment
 * @param {Record<string, string | undefined>} env
 * @returns {{ environment: string, missing: string[], ok: boolean }}
 * `missing` lists parameter NAMES only. APP_URL is listed when it is blank or
 * not an https origin.
 */
export function checkParameters(environment, env) {
  const missing = [];
  if (!isHttpsOrigin(env.APP_URL)) missing.push('APP_URL');
  if (isBlank(env.CRON_SECRET)) missing.push('CRON_SECRET');
  return { environment, missing, ok: missing.length === 0 };
}

/** Names of the alert parameters that are unset. */
export function missingAlertParameters(env) {
  return ALERT_PARAMETERS.filter((name) => isBlank(env[name]));
}

/**
 * Builds the Resend payload. Contains parameter names only, never values.
 * Requires the alert parameters to be present.
 */
export function alertParametersMissing(result, env) {
  const names = result.missing.join(', ');
  const environment = String(result.environment).replace(/[\r\n]+/g, ' ');
  const to = env.ALERT_EMAIL_TO.split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  return {
    from: env.ALERT_EMAIL_FROM.trim(),
    to,
    subject: `[Residio] Backup invoice cron skipped on ${environment}: missing ${names}`,
    text: [
      `The backup invoice-generation cron did not run for the "${environment}" environment.`,
      '',
      `Missing or invalid parameters: ${names}`,
      '',
      `Set them as secrets on the "${environment}" GitHub Environment (Settings > Environments),`,
      'then re-run the "Backup Cron - Invoice Generation" workflow.',
      'See docs/deployment/hosting-plan.md, "The GitHub Actions safety net".',
    ].join('\n'),
  };
}

/**
 * Runs the preflight for one environment.
 * @returns {Promise<{ result, outputs: Record<string,string>, exitCode: number, logs: string[] }>}
 * Sends exactly one Resend request when parameters are missing and the alert
 * parameters are present; none otherwise. exitCode is non-zero only when the
 * alert could not be sent.
 */
export async function runPreflight(environment, env, fetchImpl = globalThis.fetch) {
  const result = checkParameters(environment, env);
  const outputs = { ok: String(result.ok), missing: result.missing.join(',') };
  const logs = [];
  if (result.ok) {
    logs.push(`Backup cron parameters present for ${environment}.`);
    return { result, outputs, exitCode: 0, logs };
  }

  logs.push(`::warning::Backup cron skipped for ${environment}: missing ${result.missing.join(', ')}`);

  const alertMissing = missingAlertParameters(env);
  if (alertMissing.length > 0) {
    logs.push(
      `::error::Cannot alert the sys_admin about ${environment}: alert parameters not set (${alertMissing.join(', ')}). Parameters missing for the cron: ${result.missing.join(', ')}`,
    );
    return { result, outputs, exitCode: 1, logs };
  }

  try {
    const response = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ALERT_RESEND_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertParametersMissing(result, env)),
    });
    if (!response.ok) {
      logs.push(`::error::Resend rejected the missing-parameters alert for ${environment} (HTTP ${response.status}).`);
      return { result, outputs, exitCode: 1, logs };
    }
    logs.push(`Alert email sent for ${environment}.`);
    return { result, outputs, exitCode: 0, logs };
  } catch (error) {
    logs.push(`::error::Could not send the missing-parameters alert for ${environment}: ${error?.name ?? 'error'}`);
    return { result, outputs, exitCode: 1, logs };
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const environment = process.argv[2];
  if (!ENVIRONMENTS.includes(environment)) {
    console.error(`::error::Usage: backup-cron-preflight.mjs <${ENVIRONMENTS.join('|')}>`);
    process.exit(2);
  }
  const { outputs, exitCode, logs } = await runPreflight(environment, process.env);
  for (const line of logs) console.log(line);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `ok=${outputs.ok}\nmissing=${outputs.missing}\n`);
  }
  process.exitCode = exitCode;
}
