// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// WhatsApp Monitoring page (#1228): one refresh control drives the server-rendered
// logs (router.refresh) and the Sent messages query.

const mocks = vi.hoisted(() => ({ getSends: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/whatsapp/admin-console', () => ({ getWhatsAppOutboundSends: mocks.getSends }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { MonitorRefresh } from '@/app/(dashboard)/(oversight)/system/whatsapp-monitoring/monitor-refresh';
import { OutboundSendsList } from '@/app/(dashboard)/(oversight)/system/whatsapp-monitoring/outbound-sends-list';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MonitorRefresh /><OutboundSendsList /></QueryClientProvider>);
}

describe('WhatsApp Monitoring page refresh controls', () => {
  beforeEach(() => {
    mocks.getSends.mockReset();
    mocks.refresh.mockReset();
    mocks.getSends.mockResolvedValue({ success: true, data: { rows: [], total: 0 }, error: null });
  });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('offers auto-refresh from 1 to 30 minutes, off by default', async () => {
    renderPage();
    const select = screen.getByRole('combobox', { name: 'Auto-refresh' }) as HTMLSelectElement;
    expect(select.value).toBe('0');
    const values = Array.from(select.options).map((o) => Number(o.value)).filter((v) => v > 0);
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(30);
    await waitFor(() => expect(mocks.getSends).toHaveBeenCalledTimes(1));
  });

  it('refreshes the logs and the sent messages when Refresh now is pressed', async () => {
    renderPage();
    await waitFor(() => expect(mocks.getSends).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Refresh now/ }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.getSends).toHaveBeenCalledTimes(2));
  });

  it('refreshes again after the chosen interval passes, and stops when set off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    await waitFor(() => expect(mocks.getSends).toHaveBeenCalledTimes(1));
    const select = screen.getByRole('combobox', { name: 'Auto-refresh' });
    fireEvent.change(select, { target: { value: '1' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.getSends).toHaveBeenCalledTimes(2));
    fireEvent.change(select, { target: { value: '0' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the status filter', async () => {
    renderPage();
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'failed' } });
    await waitFor(() => expect(mocks.getSends).toHaveBeenLastCalledWith({ status: 'failed', purpose: '', page: 0 }));
  });
});
