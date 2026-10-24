// @vitest-environment jsdom
// Issue #827: a view-only role (Trustee) must not be shown write controls. Each
// control is gated on the permission its server action enforces; the server stays
// the authority, so these tests pin what the UI offers, not what it permits.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { perms } = vi.hoisted(() => ({ perms: { held: [] as string[] } }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    profile: { role_name: 'trustee' },
    hasPermission: (p: string) => perms.held.includes(p),
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

vi.mock('@/hooks/use-reports', () => ({
  useReportSchedules: () => ({
    isLoading: false,
    data: [
      { id: 's1', name: 'Monthly collections', report_type: 'financial_overview', frequency: 'monthly', period_preset: 'last_month', is_active: true, next_run_at: null },
    ],
  }),
  useCreateReportSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateReportSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteReportSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBankAccountsForFilter: () => ({ data: [] }),
}));

vi.mock('@/hooks/use-announcements', () => ({
  useAnnouncements: () => ({
    isLoading: false,
    error: null,
    data: {
      count: 1,
      data: [{ id: 'a1', title: 'Water cut', status: 'draft', priority: 'normal', target_audience: 'all', created_at: '2026-10-01T00:00:00Z', published_at: null, scheduled_for: null, is_pinned: false, summary: null, content: 'x', category: null }],
    },
  }),
  useAnnouncementCategories: () => ({ data: [] }),
  useAnnouncementAudienceGroups: () => ({ data: [] }),
  useDeleteAnnouncement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishAnnouncement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnpublishAnnouncement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveAnnouncement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ReportSchedulesPanel } from '@/components/reports/report-schedules';
import { ProjectsClient } from '@/components/projects/projects-client';
import { AnnouncementsTable } from '@/components/announcements/announcements-table';

/** What the seeded Trustee role holds for these modules: views only. */
const TRUSTEE = [
  PERMISSIONS.REPORTS_VIEW_FINANCIAL,
  PERMISSIONS.REPORTS_EXPORT,
  PERMISSIONS.PROJECTS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_VIEW,
];

afterEach(() => cleanup());

describe('Report schedules (#827)', () => {
  it('shows a Trustee the schedules but no create, toggle or delete control', () => {
    perms.held = TRUSTEE;
    render(<ReportSchedulesPanel />);

    expect(screen.getByText('Monthly collections')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new schedule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete schedule/i })).not.toBeInTheDocument();
  });

  it('shows all three to a holder of reports.manage_schedules', () => {
    perms.held = [...TRUSTEE, PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    render(<ReportSchedulesPanel />);

    expect(screen.getByRole('button', { name: /new schedule/i })).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete schedule/i })).toBeInTheDocument();
  });
});

describe('Capital projects (#827)', () => {
  it('hides New Project from a Trustee and shows it for manage_projects', () => {
    perms.held = TRUSTEE;
    const { unmount } = render(<ProjectsClient initialProjects={[]} />);
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument();
    unmount();

    perms.held = [...TRUSTEE, PERMISSIONS.PROJECTS_MANAGE];
    render(<ProjectsClient initialProjects={[]} />);
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
  });
});

describe('Announcements list (#827)', () => {
  it('hides New Announcement from a Trustee and shows it for announcements.create', () => {
    perms.held = TRUSTEE;
    const { unmount } = render(<AnnouncementsTable />);
    expect(screen.queryByRole('link', { name: /new announcement/i })).not.toBeInTheDocument();
    unmount();

    perms.held = [...TRUSTEE, PERMISSIONS.ANNOUNCEMENTS_CREATE];
    render(<AnnouncementsTable />);
    expect(screen.getByRole('link', { name: /new announcement/i })).toBeInTheDocument();
  });
});
