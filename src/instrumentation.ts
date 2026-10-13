/**
 * Fail-fast config check for deployments that start with `next start` rather
 * than the Docker image (whose CMD already runs this check before binding the
 * port). Next calls register() once per server start, after the port is bound
 * but before any request is handled, and exits the process if it throws.
 *
 * Skipped in dev and test, and during `next build` (CI builds with
 * placeholder values), so it only gates a real production server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.NODE_ENV !== 'production') return;

  const { assertValidEnv } = await import('@/lib/config/env-validation.mjs');
  assertValidEnv();
}
