import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The visitor-pass image only renders for a link the app signed (#1063). */

vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor() {
      super('image', { status: 200 });
    }
  },
}));

import { GET } from '@/app/api/og/visitor-pass/route';
import { buildSignedVisitorPassQuery } from '@/lib/security/visitor-pass-link';

const FIELDS = { visitorName: 'Ada Obi', code: '829-103', valid: 'Today', estate: '' };
const url = (query: string) => new Request(`https://residio.test/api/og/visitor-pass?${query}`);

beforeEach(() => vi.stubEnv('DATA_ENCRYPTION_KEY', 'test-visitor-pass-key'));
afterEach(() => vi.unstubAllEnvs());

describe('visitor-pass image route', () => {
  it('draws a pass for a signed link', async () => {
    const res = await GET(url(await buildSignedVisitorPassQuery(FIELDS)));
    expect(res.status).toBe(200);
  });

  it('refuses an unsigned link', async () => {
    const res = await GET(url('visitorName=Anyone&code=000-000&valid=Forever'));
    expect(res.status).toBe(403);
  });

  it('refuses a signed link whose fields were changed', async () => {
    const query = new URLSearchParams(await buildSignedVisitorPassQuery(FIELDS));
    query.set('valid', 'Forever');
    expect((await GET(url(query.toString()))).status).toBe(403);
  });

  it('refuses a link signed under a different secret', async () => {
    const query = await buildSignedVisitorPassQuery(FIELDS);
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'another-key');
    expect((await GET(url(query))).status).toBe(403);
  });

  it('fails closed with no secret configured', async () => {
    const query = await buildSignedVisitorPassQuery(FIELDS);
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');
    vi.stubEnv('GMAIL_TOKEN_ENCRYPTION_KEY', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await GET(url(query))).status).toBe(403);
    spy.mockRestore();
  });
});
