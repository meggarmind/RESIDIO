// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  saveWhatsAppCredentials: vi.fn(),
  getWhatsAppConnectionStatus: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/actions/whatsapp/connection', () => ({
  saveWhatsAppCredentials: mocks.saveWhatsAppCredentials,
  getWhatsAppConnectionStatus: mocks.getWhatsAppConnectionStatus,
  disconnectWhatsApp: vi.fn(),
  testWhatsAppConnection: vi.fn(),
  updateWhatsAppTemplateContentSids: vi.fn(),
}));

import { ConnectionSettings } from '@/app/(dashboard)/settings/whatsapp/connection-settings';

const disconnected = {
  connected: false, provider: null, phoneNumberId: null, fromNumber: null, apiVersion: null, updatedAt: null,
  updatedByName: null, hasAccessToken: false, hasVerifyToken: false, hasAppSecret: false, hasAuthToken: false,
  hasChatmaidApiKey: false, hasChatmaidWebhookSecret: false,
  hasWahaApiKey: false, hasWahaWebhookSecret: false, wahaBaseUrl: null, wahaSession: null, templateContentSids: null,
};

describe('WAHA connection form (#1262)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderWaha(initial = disconnected) {
    render(<ConnectionSettings initial={initial} siteUrl="https://residio.test" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'waha' } });
  }

  it('offers the self-hosted gateway option and shows the WAHA webhook URL', () => {
    render(<ConnectionSettings initial={disconnected} siteUrl="https://residio.test" />);
    expect(screen.getByRole('option', { name: 'Self-hosted gateway (WAHA)' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'waha' } });

    expect(screen.getByText('WAHA webhook callback URL')).toBeInTheDocument();
    expect(screen.getByText('https://residio.test/api/whatsapp/webhook/waha')).toBeInTheDocument();
  });

  it('shows the five WAHA fields', () => {
    renderWaha();

    expect(screen.getByText('API key')).toBeInTheDocument();
    expect(screen.getByText('Webhook secret')).toBeInTheDocument();
    expect(screen.getByText('Server address')).toBeInTheDocument();
    expect(screen.getByText('Session name')).toBeInTheDocument();
    expect(screen.getByText('From number (E.164)')).toBeInTheDocument();
  });

  it('saves the typed values, trimming the address and defaulting a blank session', async () => {
    mocks.saveWhatsAppCredentials.mockResolvedValue({ success: true, data: { provider: 'waha' }, error: null });
    mocks.getWhatsAppConnectionStatus.mockResolvedValue({ success: true, data: { ...disconnected, connected: true, provider: 'waha' }, error: null });
    renderWaha();

    const [apiKey, secret] = document.querySelectorAll('input[type="password"]');
    fireEvent.change(apiKey, { target: { value: 'the-key' } });
    fireEvent.change(secret, { target: { value: 'the-secret' } });
    fireEvent.change(screen.getByPlaceholderText('https://waha.example.com'), { target: { value: ' https://waha.example.com ' } });
    fireEvent.change(screen.getByPlaceholderText('default'), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText('+2348031234567'), { target: { value: '+2348031234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(mocks.saveWhatsAppCredentials).toHaveBeenCalledTimes(1));
    expect(mocks.saveWhatsAppCredentials).toHaveBeenCalledWith({
      provider: 'waha',
      apiKey: 'the-key',
      webhookSecret: 'the-secret',
      baseUrl: 'https://waha.example.com',
      session: 'default',
      fromNumber: '+2348031234567',
    });
  });

  it('never pre-fills a secret, and pre-fills the address and session that are not secrets', () => {
    render(
      <ConnectionSettings
        initial={{
          ...disconnected,
          connected: true,
          provider: 'waha',
          fromNumber: '+2348031234567',
          hasWahaApiKey: true,
          hasWahaWebhookSecret: true,
          wahaBaseUrl: 'https://waha.example.com',
          wahaSession: 'estate',
        }}
        siteUrl="https://residio.test"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace credentials' }));

    for (const input of document.querySelectorAll('input[type="password"]')) {
      expect(input).toHaveValue('');
    }
    expect(screen.getByDisplayValue('https://waha.example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('estate')).toBeInTheDocument();
  });
});
