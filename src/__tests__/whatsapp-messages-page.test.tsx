// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const getSends = vi.hoisted(() => vi.fn());
vi.mock('@/actions/whatsapp/admin-console', () => ({ getWhatsAppOutboundSends: getSends }));

import { OutboundSendsList } from '@/app/(dashboard)/system/whatsapp-messages/outbound-sends-list';

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OutboundSendsList /></QueryClientProvider>);
}

describe('WhatsApp Messages page refresh controls', () => {
  beforeEach(() => {
    getSends.mockReset();
    getSends.mockResolvedValue({ success: true, data: { rows: [], total: 0 }, error: null });
  });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('offers auto-refresh from 1 to 30 minutes, off by default', async () => {
    renderList();
    const select = screen.getByRole('combobox', { name: 'Auto-refresh' }) as HTMLSelectElement;
    expect(select.value).toBe('0');
    const values = Array.from(select.options).map((o) => Number(o.value)).filter((v) => v > 0);
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(30);
    await waitFor(() => expect(getSends).toHaveBeenCalledTimes(1));
  });

  it('fetches again when Refresh now is pressed', async () => {
    renderList();
    await waitFor(() => expect(getSends).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh now/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Refresh now/ }));
    await waitFor(() => expect(getSends).toHaveBeenCalledTimes(2));
  });

  it('fetches again after the chosen interval passes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderList();
    await waitFor(() => expect(getSends).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox', { name: 'Auto-refresh' }), { target: { value: '1' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(getSends).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(getSends).toHaveBeenCalledTimes(2);
  });

  it('keeps the status filter', async () => {
    renderList();
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'failed' } });
    await waitFor(() => expect(getSends).toHaveBeenLastCalledWith({ status: 'failed', purpose: '', page: 0 }));
  });
});
