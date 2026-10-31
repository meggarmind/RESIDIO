import path from 'node:path';

/**
 * Pure path logic for the public admin guide served at /guide (#1238).
 *
 * The guide is a Docusaurus build (`trailingSlash: false`) copied into
 * `<cwd>/guide` by the Dockerfile. No filesystem access happens here, so the
 * traversal rules can be unit-tested without touching disk.
 */

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
};

/** Content type for a file path; unknown extensions are served as opaque bytes. */
export function guideContentType(filePath: string): string {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Cache policy: `/guide/assets/**` filenames carry a content hash, so they are
 * immutable. HTML must revalidate so a new release shows at once. Anything else
 * (images, favicon, sitemap) gets a short max-age.
 */
export function guideCacheControl(relativePath: string): string {
    const normalised = relativePath.replace(/^\/+/, '');
    if (normalised.startsWith('assets/')) return 'public, max-age=31536000, immutable';
    if (path.extname(normalised).toLowerCase() === '.html') return 'no-cache';
    return 'public, max-age=3600';
}

/**
 * Turns the catch-all route segments into candidate files, tried in order, all
 * absolute and inside `root`. Returns null for any request that is malformed or
 * tries to leave the root: `..`, absolute paths, backslashes, NUL bytes.
 *
 *   []                  -> index.html
 *   ['docs','x']        -> docs/x, docs/x.html, docs/x/index.html
 */
export function resolveGuideCandidates(
    segments: readonly string[] | undefined,
    root: string,
): string[] | null {
    const decoded: string[] = [];
    for (const raw of segments ?? []) {
        let segment: string;
        try {
            segment = decodeURIComponent(raw);
        } catch {
            return null;
        }
        if (segment.includes('\0') || segment.includes('\\') || segment.includes('/')) return null;
        if (segment === '..' || segment === '.') return null;
        // Segments come from a split path, so an empty one is a double slash
        // or a trailing slash; treat it as noise rather than an error.
        if (segment === '') continue;
        decoded.push(segment);
    }

    const resolvedRoot = path.resolve(root);
    const rel = decoded.join('/');
    const rawCandidates =
        decoded.length === 0 ? ['index.html'] : [rel, `${rel}.html`, `${rel}/index.html`];

    const candidates: string[] = [];
    for (const candidate of rawCandidates) {
        const absolute = path.resolve(resolvedRoot, candidate);
        if (absolute !== resolvedRoot && !absolute.startsWith(resolvedRoot + path.sep)) return null;
        candidates.push(absolute);
    }
    return candidates;
}
