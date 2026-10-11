/**
 * Public origin resolution for server-built redirects. See #417.
 *
 * Behind a reverse proxy (Traefik) the Next.js standalone server binds to
 * HOSTNAME=0.0.0.0, so `request.url` carries the bind address and a redirect
 * built from it lands the browser on `https://0.0.0.0:3000/...`.
 *
 * Web APIs only: this is imported from middleware, which runs in the edge
 * runtime.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_SITE_URL, when it is a valid http(s) URL
 *   2. x-forwarded-host (+ x-forwarded-proto, default https)
 *   3. host header, with the request URL's protocol
 *   4. the request URL's own origin
 */

function firstValue(header: string | null): string | null {
  if (!header) return null;
  const value = header.split(',')[0]?.trim();
  return value ? value : null;
}

function configuredOrigin(): string | null {
  // Read at call time, not module load, so tests (and runtime config) can change it.
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Build `${protocol}://${host}` and return its normalized origin, or null if malformed. */
function originFrom(protocol: string, host: string): string | null {
  try {
    const url = new URL(`${protocol}://${host}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // A host header must be a bare authority; reject anything carrying a path/userinfo.
    if (url.pathname !== '/' || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getPublicOrigin(request: Request): string {
  const configured = configuredOrigin();
  if (configured) return configured;

  const headers = request.headers;
  const requestUrl = new URL(request.url);

  const forwardedHost = firstValue(headers.get('x-forwarded-host'));
  if (forwardedHost) {
    const proto = firstValue(headers.get('x-forwarded-proto')) ?? 'https';
    const origin = originFrom(proto, forwardedHost);
    if (origin) return origin;
  }

  const host = firstValue(headers.get('host'));
  if (host) {
    const origin = originFrom(requestUrl.protocol.replace(/:$/, ''), host);
    if (origin) return origin;
  }

  return requestUrl.origin;
}
