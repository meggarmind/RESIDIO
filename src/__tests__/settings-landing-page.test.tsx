// @vitest-environment jsdom
//
// #786: the Settings landing page gives every page a card (index pages
// included), searches them, and shows a setup checklist until it is complete.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { SETUP_STEPS, type SetupStatus } from '@/lib/settings/setup-checklist';

const mocks = vi.hoisted(() => ({ status: null as SetupStatus | null, isLoading: false }));

vi.mock('next/navigation', () => ({ usePathname: () => '/settings' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: mocks.isLoading, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/actions/settings/get-setup-status', () => ({
  getSetupStatus: async () => ({ data: mocks.status, error: null }),
}));

import SettingsPage from '@/app/(dashboard)/settings/page';

const allSteps = (done: boolean) =>
  Object.fromEntries(SETUP_STEPS.map((step) => [step.id, done])) as SetupStatus;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

const cardHrefs = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));

afterEach(() => {
  cleanup();
  mocks.status = null;
  mocks.isLoading = false;
});

describe('Settings landing page (#786)', () => {
  it('has a card for each index page an earlier version hid', () => {
    renderPage();
    for (const href of ['/settings/billing', '/settings/sending', '/settings/security', '/settings/reminders']) {
      expect(cardHrefs()).toContain(href);
    }
  });

  it('shows a skeleton, not cards, while permissions load', () => {
    mocks.isLoading = true;
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('counts an empty estate as 0 of N done', async () => {
    mocks.status = allSteps(false);
    renderPage();
    expect(await screen.findByText(`0 of ${SETUP_STEPS.length} done`)).toBeInTheDocument();
    expect(screen.getAllByText('Not set up').length).toBeGreaterThan(0);
  });

  it('counts a partly set-up estate', async () => {
    mocks.status = { ...allSteps(false), estate: true, street: true, customRole: true };
    renderPage();
    expect(await screen.findByText(`3 of ${SETUP_STEPS.length} done`)).toBeInTheDocument();
  });

  it('hides the checklist once every step is done', async () => {
    mocks.status = allSteps(true);
    renderPage();
    expect((await screen.findAllByText('Set up')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Setup checklist')).not.toBeInTheDocument();
  });

  it('narrows the cards to search matches', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search settings'), { target: { value: 'late fee' } });
    expect(cardHrefs()).toContain('/settings/billing');
    expect(cardHrefs()).not.toContain('/settings/streets');
  });
});
