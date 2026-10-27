import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
    guideCacheControl,
    guideContentType,
    resolveGuideCandidates,
} from '@/lib/guide/resolve-guide-path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public admin guide (#1238). Serves the Docusaurus build the Dockerfile copies
 * to `<cwd>/guide`. Deliberately unauthenticated: the guide is already public
 * on GitHub Pages, and `/guide` is in `publicRoutePrefixes`. It serves only
 * files under that folder; the resolver rejects anything that would leave it.
 */
const GUIDE_ROOT = path.join(process.cwd(), 'guide');

type RouteContext = { params: Promise<{ path?: string[] }> };

async function readFileIfExists(candidate: string): Promise<Buffer | null> {
    try {
        const stat = await fs.stat(candidate);
        if (!stat.isFile()) return null;
        return await fs.readFile(candidate);
    } catch {
        return null;
    }
}

async function serve(context: RouteContext, includeBody: boolean): Promise<Response> {
    try {
        await fs.access(GUIDE_ROOT);
    } catch {
        return new NextResponse('The admin guide is built only in the Docker image.', {
            status: 404,
        });
    }

    const { path: segments } = await context.params;
    const candidates = resolveGuideCandidates(segments, GUIDE_ROOT);

    for (const candidate of candidates ?? []) {
        const body = await readFileIfExists(candidate);
        if (!body) continue;
        const relative = path.relative(GUIDE_ROOT, candidate).split(path.sep).join('/');
        return new NextResponse(includeBody ? new Uint8Array(body) : null, {
            status: 200,
            headers: {
                'Content-Type': guideContentType(candidate),
                'Content-Length': String(body.length),
                'Cache-Control': guideCacheControl(relative),
            },
        });
    }

    const notFound = await readFileIfExists(path.join(GUIDE_ROOT, '404.html'));
    if (notFound) {
        return new NextResponse(includeBody ? new Uint8Array(notFound) : null, {
            status: 404,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache',
            },
        });
    }
    return new NextResponse('Not found', { status: 404 });
}

export async function GET(_request: Request, context: RouteContext) {
    return serve(context, true);
}

export async function HEAD(_request: Request, context: RouteContext) {
    return serve(context, false);
}
