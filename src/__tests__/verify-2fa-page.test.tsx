import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/app/auth/verify-2fa/verify-2fa-form', () => ({
  Verify2FAForm: () => <div>Two-factor form</div>,
}));

import Verify2FAPage from '@/app/auth/verify-2fa/page';

describe('/auth/verify-2fa page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects an unauthenticated request to login before rendering', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(Verify2FAPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });

  it('renders the existing two-factor form for an authenticated user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'resident@example.com' } },
      error: null,
    });

    const markup = renderToStaticMarkup(await Verify2FAPage());

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(markup).toContain('Two-factor form');
  });
});
