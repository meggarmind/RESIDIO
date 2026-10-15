/**
 * Build identity, supplied by CI as Docker build args (see Dockerfile and
 * docs/deployment/hosting-plan.md). Absent values fall back safely and this
 * never throws.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when the full name is written
 * out literally, so each variable is referenced by name below. Do not read
 * package.json: its version is frozen on purpose and the git tag is the version
 * (CORE.md section 7).
 */
export type BuildEnv = 'production' | 'staging' | 'development';

export interface BuildInfo {
  version: string;
  sha: string;
  shortSha: string;
  env: BuildEnv;
}

export function getBuildInfo(): BuildInfo {
  const version = (process.env.NEXT_PUBLIC_APP_VERSION ?? '').trim() || 'dev';
  const sha = (process.env.NEXT_PUBLIC_GIT_SHA ?? '').trim() || 'unknown';
  const rawEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? '').trim().toLowerCase();

  let env: BuildEnv = 'development';
  if (rawEnv === 'production' || rawEnv === 'prod') env = 'production';
  else if (rawEnv === 'staging' || rawEnv === 'stage') env = 'staging';

  return { version, sha, shortSha: sha === 'unknown' ? 'unknown' : sha.slice(0, 7), env };
}

export interface BuildLabel {
  /** What the sidebar shows: `v1.0.0+341` past a release, otherwise the version as-is. */
  short: string;
  /** The full identity, for the tooltip. Never repeats the commit hash. */
  full: string;
}

// `<tag>-<commits>-g<sha>`, as resolveVersion in scripts/coolify-version.mjs emits it.
const DESCRIBED = /^(v\d+\.\d+\.\d+)-(\d+)-g([0-9a-f]+)$/;

export function formatBuildLabel({ version, shortSha }: Pick<BuildInfo, 'version' | 'shortSha'>): BuildLabel {
  const described = DESCRIBED.exec(version);
  if (described) return { short: `${described[1]}+${described[2]}`, full: version };
  return { short: version, full: `${version} · ${shortSha}` };
}
