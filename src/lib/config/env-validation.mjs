/**
 * Startup environment validation (#396).
 *
 * Fail-fast: a container with a mistyped variable otherwise starts, reports
 * healthy and 500s every request. This module names EVERY missing or malformed
 * strict variable and exits non-zero before the server accepts traffic.
 *
 * Deliberately a dependency-free .mjs: the Docker image runs it with plain
 * `node` before `server.js` binds its port (see Dockerfile CMD), and the
 * standalone bundle contains no TypeScript toolchain. src/instrumentation.ts
 * imports the same file for non-Docker `next start` deployments.
 *
 * Idiom and message style mirror src/lib/auth/cron-auth.ts. The Supabase names
 * are the ones src/lib/supabase/config.ts reads, selected by
 * NEXT_PUBLIC_ENV_MODE. That file is not edited or imported here.
 */

/** Variables read only by feature-gated integrations: warn at boot, continue. */
export const WARN_ONLY_VARS = [
  'RESEND_API_KEY',
  'EMAIL_FROM_ADDRESS',
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_WEBHOOK_SECRET',
  'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY',
  'TERMII_API_KEY',
  'DATA_ENCRYPTION_KEY',
  'GMAIL_TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_GRAPH_BASE_URL',
];

/**
 * Same selection rule as src/lib/supabase/config.ts: 'local' (the default when
 * unset) reads the _LOCAL names, anything else reads the _CLOUD names.
 */
function supabaseNames(env) {
  const suffix = (env.NEXT_PUBLIC_ENV_MODE || 'local') === 'local' ? 'LOCAL' : 'CLOUD';
  return {
    url: `NEXT_PUBLIC_SUPABASE_URL_${suffix}`,
    anonKey: `NEXT_PUBLIC_SUPABASE_ANON_KEY_${suffix}`,
    serviceRoleKey: `SUPABASE_SERVICE_ROLE_KEY_${suffix}`,
  };
}

function isBlank(value) {
  return value === undefined || value.trim() === '';
}

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Collect problems for the given strict names; `urlNames` must also parse as URLs. */
function collect(env, names, urlNames) {
  const missing = [];
  const malformed = [];
  for (const name of names) {
    const value = env[name];
    if (isBlank(value)) missing.push(name);
    else if (urlNames.includes(name) && !isHttpUrl(value.trim())) malformed.push(name);
  }
  const errors = [
    ...missing.map((name) => `${name} is missing`),
    ...malformed.map((name) => `${name} is not a valid http(s) URL`),
  ];
  return { ok: errors.length === 0, errors, missing, malformed };
}

/**
 * Validate the runtime environment. Pure: reads only `env`, never logs or exits.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: boolean, errors: string[], missing: string[], malformed: string[], warnings: string[] }}
 */
export function validateEnv(env = process.env) {
  const sb = supabaseNames(env);
  const strict = [sb.url, sb.anonKey, sb.serviceRoleKey, 'CRON_SECRET'];
  return {
    ...collect(env, strict, [sb.url]),
    warnings: WARN_ONLY_VARS.filter((name) => isBlank(env[name])),
  };
}

/**
 * Validate the NEXT_PUBLIC_* values Next.js inlines into the client bundle at
 * build time. Missing here cannot be repaired by a runtime variable. The
 * service-role key and CRON_SECRET are deliberately excluded: the Dockerfile
 * builds with a placeholder service-role key, and neither is inlined.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function validateBuildEnv(env = process.env) {
  const sb = supabaseNames(env);
  return { ...collect(env, [sb.url, sb.anonKey], [sb.url]), warnings: [] };
}

/**
 * Run validation with side effects: one warning per warn-only variable, and on
 * any strict failure one error listing everything, then `exit(1)`.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {'runtime' | 'build'} [options.mode]
 * @param {(code: number) => void} [options.exit]
 * @param {{ warn: (m: string) => void, error: (m: string) => void }} [options.logger]
 */
export function assertValidEnv({
  env = process.env,
  mode = 'runtime',
  exit = (code) => process.exit(code),
  logger = console,
} = {}) {
  const result = mode === 'build' ? validateBuildEnv(env) : validateEnv(env);
  for (const name of result.warnings) {
    logger.warn(`[Config] ${name} is not set; the feature that uses it will be disabled`);
  }
  if (!result.ok) {
    logger.error(
      `[Config] Invalid ${mode} configuration, refusing to start:\n` +
        result.errors.map((e) => `  - ${e}`).join('\n')
    );
    exit(1);
  }
  return result;
}

// CLI, used by the Dockerfile: `node preflight-env.mjs [--build]`. Only fires
// when this file is the entry script, never when imported.
if (typeof process !== 'undefined' && /(^|[\\/])preflight-env\.mjs$/.test(process.argv[1] || '')) {
  assertValidEnv({ mode: process.argv.includes('--build') ? 'build' : 'runtime' });
}
