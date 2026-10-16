import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import EmailDebugRedirectPage from '@/app/(dashboard)/settings/email/debug/page';

describe('/settings/email/debug', () => {
  it('redirects to the Debug Mode section so old bookmarks keep working', () => {
    EmailDebugRedirectPage();
    expect(mocks.redirect).toHaveBeenCalledWith('/settings/comms-override#debug-mode');
  });
});
