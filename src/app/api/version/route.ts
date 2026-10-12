import { NextResponse } from 'next/server';
import { getBuildInfo } from '@/lib/version';

// Public by design (/api is a public prefix in middleware). Exposes only the
// build identity, which is already visible in the admin sidebar.
export async function GET() {
  const { version, sha, env } = getBuildInfo();
  return NextResponse.json({ version, sha, env }, { headers: { 'Cache-Control': 'no-store' } });
}
