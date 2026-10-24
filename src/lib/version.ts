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

/** Parses a raw `NEXT_PUBLIC_APP_ENV` value. Unset or unrecognised is `development`. */
export function parseBuildEnv(raw: string | undefined | null): BuildEnv {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'production' || value === 'prod') return 'production';
  if (value === 'staging' || value === 'stage') return 'staging';
  return 'development';
}

export function getBuildInfo(): BuildInfo {
  const version = (process.env.NEXT_PUBLIC_APP_VERSION ?? '').trim() || 'dev';
  const sha = (process.env.NEXT_PUBLIC_GIT_SHA ?? '').trim() || 'unknown';
  const env = parseBuildEnv(process.env.NEXT_PUBLIC_APP_ENV);

  return { version, sha, shortSha: sha === 'unknown' ? 'unknown' : sha.slice(0, 7), env };
}

export interface BuildLabel {
  /** What the sidebar shows: `v1.0.341-dev` past a release (tag patch + commits), otherwise the version as-is. */
  short: string;
  /** The full identity, for the tooltip. Never repeats the commit hash. */
  full: string;
}

// `<tag>-<commits>-g<sha>`, as resolveVersion in scripts/coolify-version.mjs emits it.
const DESCRIBED = /^(v\d+\.\d+\.\d+)-(\d+)-g([0-9a-f]+)$/;
// Splits the tag so the commit count can be added to its patch.
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

export function formatBuildLabel({ version, shortSha }: Pick<BuildInfo, 'version' | 'shortSha'>): BuildLabel {
  const described = DESCRIBED.exec(version);
  if (described) {
    // Each commit past the tag counts as one patch, so a stage build reads as the next version; no rollover into minor.
    const [, major, minor, patch] = TAG.exec(described[1])!;
    return { short: `v${major}.${minor}.${Number(patch) + Number(described[2])}-dev`, full: version };
  }
  return { short: version, full: `${version} · ${shortSha}` };
}
