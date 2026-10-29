// @vitest-environment jsdom
// Issue #1328: "Post to estate group" is offered only for the whole estate with WAHA and a group set,
// and Publish on a ticked draft is hidden, with the reason, from a user without announcements.post_to_group.
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { state } = vi.hoisted(() => ({
  state: { held: [] as string[], available: true, announcement: {} as Record<string, unknown> },
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, profile: { role_name: 'x' }, hasPermission: (p: string) => state.held.includes(p) }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), notFound: vi.fn() }));
vi.mock('@/components/announcements/audience-reach', () => ({ AudienceReach: () => null }));
vi.mock('@/components/announcements', async (orig) => ({ ...(await orig<object>()), ReadReceiptStats: () => null }));
vi.mock('@/hooks/use-announcements', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useAnnouncement: () => ({ isLoading: false, error: null, data: state.announcement }),
    useAnnouncementCategories: () => ({ data: [], isLoading: false }),
    useAnnouncementAudienceGroups: () => ({ data: [] }),
    useEstateGroupPostAvailability: () => ({ data: state.available }),
    usePublishAnnouncement: mutation,
    useUnpublishAnnouncement: mutation,
    useArchiveAnnouncement: mutation,
    useDeleteAnnouncement: mutation,
  };
});

import AnnouncementDetailPage from '@/app/(dashboard)/announcements/[id]/page';
import { AnnouncementForm } from '@/components/announcements/announcement-form';
import { GROUP_POST_PERMISSION_REASON } from '@/lib/announcements/group-post-rules';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const TICKED_DRAFT = {
  id: 'a1',
  title: 'Water outage',
  content: 'The water will be off on Saturday.',
  summary: 'Water off Saturday',
  status: 'draft',
  priority: 'normal',
  target_audience: 'all',
  target_group_slug: null,
  target_houses: null,
  is_pinned: false,
  post_to_whatsapp_group: true,
  created_at: '2026-10-29T00:00:00Z',
  published_at: null,
  scheduled_for: null,
  expires_at: null,
};

afterEach(cleanup);

// Radix Switch measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

async function renderDetail() {
  const params = Promise.resolve({ id: 'a1' });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <AnnouncementDetailPage params={params} />
      </Suspense>
    );
  });
  await screen.findByRole('heading', { name: 'Water outage' });
}

describe('Publish on a draft ticked "Post to estate group"', () => {
  it('is hidden, with the reason, from a publisher without announcements.post_to_group', async () => {
    state.held = [PERMISSIONS.ANNOUNCEMENTS_PUBLISH];
    state.announcement = TICKED_DRAFT;
    await renderDetail();
    expect(screen.queryByRole('button', { name: /publish now/i })).not.toBeInTheDocument();
    expect(screen.getByText(GROUP_POST_PERMISSION_REASON)).toBeInTheDocument();
  });

  it('shows for a holder', async () => {
    state.held = [PERMISSIONS.ANNOUNCEMENTS_PUBLISH, PERMISSIONS.ANNOUNCEMENTS_POST_TO_GROUP];
    state.announcement = TICKED_DRAFT;
    await renderDetail();
    expect(screen.getByRole('button', { name: /publish now/i })).toBeInTheDocument();
    expect(screen.queryByText(GROUP_POST_PERMISSION_REASON)).not.toBeInTheDocument();
  });

  it('shows to a non-holder once the tick is off', async () => {
    state.held = [PERMISSIONS.ANNOUNCEMENTS_PUBLISH];
    state.announcement = { ...TICKED_DRAFT, post_to_whatsapp_group: false };
    await renderDetail();
    expect(screen.getByRole('button', { name: /publish now/i })).toBeInTheDocument();
  });
});

describe('the "Post to estate group" tick on the form', () => {
  it('shows with a preview of the exact text when WAHA and a group are set', () => {
    state.available = true;
    render(<AnnouncementForm announcement={TICKED_DRAFT as never} onSubmit={vi.fn()} mode="edit" />);
    expect(screen.getByText('Post to estate group')).toBeInTheDocument();
    expect(screen.getByLabelText('Estate group message preview').textContent).toBe('Water outage\n\nWater off Saturday');
  });

  it('is not offered without WAHA and a group', () => {
    state.available = false;
    render(<AnnouncementForm announcement={TICKED_DRAFT as never} onSubmit={vi.fn()} mode="edit" />);
    expect(screen.queryByText('Post to estate group')).not.toBeInTheDocument();
  });

  it('is not offered for a part of the estate', () => {
    state.available = true;
    render(<AnnouncementForm announcement={{ ...TICKED_DRAFT, target_audience: 'tenants' } as never} onSubmit={vi.fn()} mode="edit" />);
    expect(screen.queryByText('Post to estate group')).not.toBeInTheDocument();
  });
});
