// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

vi.setConfig({ testTimeout: 60000 });

const { getSystemActionLog } = vi.hoisted(() => ({ getSystemActionLog: vi.fn() }));
vi.mock('@/actions/system/action-log', () => ({ getSystemActionLog }));

import SystemActionLogPage from '@/app/(dashboard)/system/action-log/page';

const row = (id: string) => ({
  id,
  occurred_at: '2026-10-15T10:00:00.000Z',
  source: `cron:job-${id}`,
  action: 'run',
  outcome: 'success',
  summary: {},
  error_message: null,
  duration_ms: 5,
});

function ok(total: number, page = 1) {
  return { data: { data: [row('1')], total, page, limit: 25 }, error: null };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemActionLogPage />
    </QueryClientProvider>
  );
}

describe('System Action Log page', () => {
  beforeEach(() => {
    getSystemActionLog.mockReset();
  });
  afterEach(cleanup);

  it('shows an explicit error when the action returns an error', async () => {
    getSystemActionLog.mockResolvedValue({ data: null, error: 'Forbidden' });
    renderPage();

    expect(await screen.findByText(/Could not load the action log: Forbidden/)).toBeInTheDocument();
    expect(screen.getByText('Unable to load entries')).toBeInTheDocument();
    expect(screen.queryByText('No actions recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('shows an explicit error when the action throws', async () => {
    getSystemActionLog.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(
      await screen.findByText(/Could not load the action log: network down/)
    ).toBeInTheDocument();
    expect(screen.getByText('Unable to load entries')).toBeInTheDocument();
    expect(screen.queryByText('No actions recorded')).not.toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last', async () => {
    getSystemActionLog.mockResolvedValue(ok(30));
    renderPage();

    const next = await screen.findByRole('button', { name: /Next/ });
    const prev = screen.getByRole('button', { name: /Previous/ });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    await screen.findByText(/Page 2 of 2/);
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Previous/ })).toBeEnabled();
  });

  it('clears applied filters and goes back to unfiltered results', async () => {
    getSystemActionLog.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 25 }, error: null });
    renderPage();
    await screen.findByText('No actions recorded');

    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'cron:x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await screen.findByText('No entries match the current filters.');
    await waitFor(() =>
      expect(getSystemActionLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: 'cron:x', page: 1 })
      )
    );

    // The empty state's own "Clear filters" button is present while filtered.
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await screen.findByText(/Automated runs such as cron jobs/);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Source')).toHaveValue('');
    await waitFor(() =>
      expect(getSystemActionLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: undefined, outcome: undefined })
      )
    );
  });
});
