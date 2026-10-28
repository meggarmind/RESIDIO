// @vitest-environment jsdom
//
// #1271: the current WhatsApp provider is visible without a click, with a Change provider button.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { flattenSettingsNav, flattenSettingsRows, settingsConfig } from '@/config/settings-nav';

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/actions/whatsapp/connection', () => ({
  saveWhatsAppCredentials: vi.fn(),
  getWhatsAppConnectionStatus: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  testWhatsAppConnection: vi.fn(),
  updateWhatsAppTemplateContentSids: vi.fn(),
}));

import { ConnectionSettings } from '@/app/(dashboard)/settings/whatsapp/connection-settings';

const base = {
  connected: true, provider: 'chatmaid', phoneNumberId: null, fromNumber: '+2348031234567', apiVersion: null,
  updatedAt: '2026-10-27T10:00:00.000Z', updatedByName: 'Admin', hasAccessToken: false, hasVerifyToken: false,
  hasAppSecret: false, hasAuthToken: false, hasChatmaidApiKey: true, hasChatmaidWebhookSecret: true,
  hasWahaApiKey: false, hasWahaWebhookSecret: false, wahaBaseUrl: null, wahaSession: null, templateContentSids: null,
} as const;

describe('provider row (#1271)', () => {
  afterEach(cleanup);

  it.each([
    ['meta', 'Meta'],
    ['twilio', 'Twilio'],
    ['chatmaid', 'Chatmaid'],
    ['waha', 'WAHA'],
  ] as const)('shows %s and its saved date without a click', (provider, label) => {
    render(<ConnectionSettings initial={{ ...base, provider }} siteUrl="https://residio.test" />);
    expect(screen.getByText(`${label}, connected 27 Oct 2026`)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('Change provider opens the provider list with WAHA; Cancel closes it and restores the saved provider', () => {
    render(<ConnectionSettings initial={base} siteUrl="https://residio.test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Change provider' }));
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(screen.getByRole('option', { name: 'Self-hosted gateway (WAHA)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'waha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Chatmaid webhook callback URL')).toBeInTheDocument();
  });

  it('says none is connected when nothing is saved', () => {
    render(<ConnectionSettings initial={{ ...base, connected: false, provider: null, updatedAt: null }} siteUrl="https://residio.test" />);
    expect(screen.getByText('None connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change provider' })).not.toBeInTheDocument();
  });
});

describe('settings registry for /settings/whatsapp (#1271)', () => {
  it('finds the Provider row by WAHA and the other keywords', () => {
    const row = flattenSettingsRows(settingsConfig).find((m) => m.row.id === 'whatsapp-provider')!;
    expect(row.row.label).toBe('Provider');
    for (const k of ['provider', 'WAHA', 'Chatmaid', 'Twilio', 'Meta', 'switch']) expect(row.row.keywords).toContain(k);
  });

  it('lists a section for every jump tab', () => {
    const item = flattenSettingsNav(settingsConfig).find((i) => i.href === '/settings/whatsapp')!;
    expect(item.sections!.map((s) => s.id)).toEqual(['connection', 'channel', 'rollout', 'pin-policy', 'opt-ins', 'balance', 'assistant', 'privacy']);
  });
});
