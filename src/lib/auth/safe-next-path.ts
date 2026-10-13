/**
 * Strict allow-list for the post-2FA `next` redirect (#455).
 *
 * Accepts only a same-origin path: a single leading "/", whose next character
 * (if any) is [A-Za-z0-9_-], with no control characters or backslashes before
 * OR after percent-decoding. The URL parser must agree it is same-origin and
 * that its pathname is exactly the decoded input path. Anything else falls
 * back to /dashboard. Rejects `//x`, `/\x`, `/%09/x`, `/%2F/x`, `https://x`,
 * `javascript:` and mixed encodings.
 */
export const DEFAULT_NEXT_PATH = '/dashboard';

const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const SAFE_SECOND_CHAR = /^\/(?:$|[A-Za-z0-9_-])/;

function shapeOk(value: string): boolean {
  return value.startsWith('/') && SAFE_SECOND_CHAR.test(value) && !CONTROL_OR_BACKSLASH.test(value);
}

export function safeNextPath(next: string | null | undefined, origin: string): string {
  if (!next) return DEFAULT_NEXT_PATH;

  try {
    let decoded = next;
    // Decode repeatedly so double encoding (%252F) cannot hide a bad shape.
    for (let i = 0; i < 3; i++) {
      const once = decodeURIComponent(decoded);
      if (once === decoded) break;
      decoded = once;
    }
    if (!shapeOk(next) || !shapeOk(decoded)) return DEFAULT_NEXT_PATH;

    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return DEFAULT_NEXT_PATH;

    const pathPart = (value: string) => value.split(/[?#]/, 1)[0];
    if (decodeURIComponent(url.pathname) !== decodeURIComponent(pathPart(next))) return DEFAULT_NEXT_PATH;

    return next;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}
