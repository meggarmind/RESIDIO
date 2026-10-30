// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// WhatsApp bot health (#1273): the four read-only windows moved from Settings > WhatsApp, one jump tab each.

const person = { first_name: 'Ada', last_name: 'Okoro', resident_code: 'RES001' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/system/whatsapp-bot-health',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-settings-navigation', () => ({ useSettingsNavigation: () => ({ groups: [] }) }));
vi.mock('@/actions/whatsapp/admin-console', () => ({
  getWhatsAppHealth: vi.fn(async () => ({ data: { inboundToday: 41, outboundToday: 37, deliveryFailuresToday: 2, templateErrorsToday: 0, capLimitEventsToday: 0 }, error: null })),
  getWhatsAppSurveySummary: vi.fn(async () => ({ data: { asked: 9, byScore: { good: 5, okay: 3, poor: 1 }, byReason: {} }, error: null })),
  getWhatsAppDeliveryProblems: vi.fn(async () => ({
    data: [{ id: 'd1', purpose: 'notification', phone_number: '+2348011112222', inbound_message_id: null, status: 'failed', error_code: '63016', error_message: 'Outside window', created_at: '2026-10-27T09:00:00Z', resident: person }],
    error: null,
  })),
  getWhatsAppStatementFlags: vi.fn(async () => ({
    data: [{ id: 's1', phone_number: '+2348033334444', period: 'custom', from_date: '2026-01-01', to_date: '2026-09-30', row_count: 120, created_at: '2026-10-26T09:00:00Z', resident: { first_name: 'Bayo', last_name: 'Adeyemi', resident_code: 'RES002' }, house: null }],
    error: null,
  })),
}));

import WhatsAppBotHealthPage from '@/app/(dashboard)/(oversight)/system/whatsapp-bot-health/page';

afterEach(() => cleanup());

describe('WhatsApp bot health page', () => {
  it('renders the four sections from the action results, with a jump tab for each', async () => {
    render(await WhatsAppBotHealthPage());

    expect(screen.getByRole('heading', { level: 1, name: 'WhatsApp bot health' })).toBeInTheDocument();

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Bot health', 'Feedback', 'Undelivered', 'Statements waiting']);

    const health = screen.getByRole('region', { name: 'Bot health' });
    expect(within(health).getByText('41')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Feedback' })).getByText('Asked: 9')).toBeInTheDocument();
    const undelivered = screen.getByRole('region', { name: 'Undelivered' });
    expect(within(undelivered).getByText('Ada Okoro')).toBeInTheDocument();
    expect(within(undelivered).getByText('63016: Outside window')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Statements waiting' })).getByText('Bayo Adeyemi')).toBeInTheDocument();
  });
});
