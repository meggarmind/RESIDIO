import { parseBuildEnv, type BuildEnv } from '@/lib/version';

export interface CommsEnvironment {
  env: BuildEnv;
  isProduction: boolean;
  /** Short tag used in subject and body labels. */
  label: string;
}

const LABELS: Record<BuildEnv, string> = {
  production: 'PROD',
  staging: 'STAGE',
  development: 'DEV',
};

/**
 * Environment from `NEXT_PUBLIC_APP_ENV`, parsed by `parseBuildEnv` in
 * `@/lib/version`. Unset or unrecognised is NON-production, so a missing
 * variable turns the redirect on rather than off.
 */
export function getCommsEnvironment(raw: string | undefined = process.env.NEXT_PUBLIC_APP_ENV): CommsEnvironment {
  const env = parseBuildEnv(raw);
  return { env, isProduction: env === 'production', label: LABELS[env] };
}
