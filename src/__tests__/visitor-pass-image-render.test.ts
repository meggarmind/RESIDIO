import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/og/visitor-pass/route';
import { buildSignedVisitorPassQuery } from '@/lib/security/visitor-pass-link';

/** A signed link must produce a real PNG through next/og, not a render error (#1063). */

afterEach(() => vi.unstubAllEnvs());

it('renders the pass image for a signed link', async () => {
  vi.stubEnv('DATA_ENCRYPTION_KEY', 'test-visitor-pass-key');
  const query = await buildSignedVisitorPassQuery({ visitorName: 'Ada Obi', code: '829-103', valid: 'Today', estate: '' });
  const res = await GET(new Request(`https://residio.test/api/og/visitor-pass?${query}`));
  const png = new Uint8Array(await res.arrayBuffer());
  expect(res.status).toBe(200);
  expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
});
