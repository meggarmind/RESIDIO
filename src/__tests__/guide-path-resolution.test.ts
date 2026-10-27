import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
    guideCacheControl,
    guideContentType,
    resolveGuideCandidates,
} from '@/lib/guide/resolve-guide-path';

const ROOT = path.resolve('/app/guide');
const p = (...parts: string[]) => path.join(ROOT, ...parts);

describe('resolveGuideCandidates', () => {
    it('maps the guide root to index.html', () => {
        expect(resolveGuideCandidates(undefined, ROOT)).toEqual([p('index.html')]);
        expect(resolveGuideCandidates([], ROOT)).toEqual([p('index.html')]);
    });

    it('tries as-is, .html and index.html for a page', () => {
        expect(resolveGuideCandidates(['docs', 'release-notes'], ROOT)).toEqual([
            p('docs', 'release-notes'),
            p('docs', 'release-notes.html'),
            p('docs', 'release-notes', 'index.html'),
        ]);
    });

    it('resolves a nested index and an asset', () => {
        expect(resolveGuideCandidates(['docs'], ROOT)?.[2]).toBe(p('docs', 'index.html'));
        expect(resolveGuideCandidates(['assets', 'js', 'main.abc.js'], ROOT)?.[0]).toBe(
            p('assets', 'js', 'main.abc.js'),
        );
    });

    it('decodes encoded segments and ignores empty ones', () => {
        expect(resolveGuideCandidates(['docs', 'a%20b', ''], ROOT)?.[0]).toBe(p('docs', 'a b'));
    });

    it.each([
        ['dot-dot', ['..', 'etc', 'passwd']],
        ['nested dot-dot', ['docs', '..', '..', 'x']],
        ['encoded dot-dot', ['%2e%2e', 'x']],
        ['encoded dot-dot upper', ['%2E%2E']],
        ['encoded slash', ['docs%2f..%2f..%2fx']],
        ['backslash', ['..\\secret']],
        ['encoded backslash', ['docs%5Cx']],
        ['encoded NUL byte', ['index.html%00.png']],
        ['raw NUL byte', ['a\0b']],
        ['absolute path', ['/etc/passwd']],
        ['malformed encoding', ['%E0%A4%A']],
    ])('rejects %s', (_name, segments) => {
        expect(resolveGuideCandidates(segments, ROOT)).toBeNull();
    });
});

describe('guideContentType', () => {
    it.each([
        ['index.html', 'text/html; charset=utf-8'],
        ['a.js', 'text/javascript; charset=utf-8'],
        ['a.css', 'text/css; charset=utf-8'],
        ['a.json', 'application/json; charset=utf-8'],
        ['a.svg', 'image/svg+xml'],
        ['a.png', 'image/png'],
        ['a.JPG', 'image/jpeg'],
        ['a.jpeg', 'image/jpeg'],
        ['a.webp', 'image/webp'],
        ['a.gif', 'image/gif'],
        ['favicon.ico', 'image/x-icon'],
        ['a.woff', 'font/woff'],
        ['a.woff2', 'font/woff2'],
        ['robots.txt', 'text/plain; charset=utf-8'],
        ['sitemap.xml', 'application/xml; charset=utf-8'],
        ['a.js.map', 'application/json; charset=utf-8'],
        ['a.bin', 'application/octet-stream'],
    ])('%s -> %s', (file, type) => {
        expect(guideContentType(file)).toBe(type);
    });
});

describe('guideCacheControl', () => {
    it('makes hashed assets immutable', () => {
        expect(guideCacheControl('assets/js/main.abc.js')).toBe(
            'public, max-age=31536000, immutable',
        );
    });
    it('revalidates html, including pages under docs/', () => {
        expect(guideCacheControl('index.html')).toBe('no-cache');
        expect(guideCacheControl('docs/release-notes.html')).toBe('no-cache');
    });
    it('gives other files a short max-age', () => {
        expect(guideCacheControl('img/logo.png')).toBe('public, max-age=3600');
    });
});
