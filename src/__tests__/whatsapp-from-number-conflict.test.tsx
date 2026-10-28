// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({ state: null as unknown }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/whatsapp/connection', () => ({
  saveWhatsAppCredentials: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  testWhatsAppConnection: vi.fn(),
  getWhatsAppConnectionStatus: vi.fn(),
  updateWhatsAppTemplateContentSids: vi.fn(),
}));
vi.mock('@/actions/settings/comms-override', () => ({
  getCommsOverrideState: vi.fn(async () => ({ data: mocks.state, error: null })),
  updateCommsOverrideSettings: vi.fn(),
  setDebugMode: vi.fn(),
}));

import { ConnectionSettings } from '@/app/(dashboard)/settings/whatsapp/connection-settings';
import { TestingSection } from '@/components/settings/messages/testing-section';

const FROM = '+2348037000101';

describe('WhatsApp connection form from-number conflict (#904)', () => {
  const disconnected = {
    connected: false, provider: null, phoneNumberId: null, fromNumber: null, apiVersion: null, updatedAt: null,
    updatedByName: null, hasAccessToken: false, hasVerifyToken: false, hasAppSecret: false, hasAuthToken: false,
    hasChatmaidApiKey: false, hasChatmaidWebhookSecret: false,
    hasWahaApiKey: false, hasWahaWebhookSecret: false, wahaBaseUrl: null, wahaSession: null, templateContentSids: null,
  };

  afterEach(cleanup);

  function renderChatmaid(overrideNumbers: { phone: string; whatsappPhone: string }) {
    render(<ConnectionSettings initial={disconnected} siteUrl="http://localhost:3000" overrideNumbers={overrideNumbers} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'chatmaid' } });
    return screen.getByPlaceholderText('+2348031234567');
  }
  const saveButton = () => screen.getByRole('button', { name: 'Save credentials' });

  it('shows an inline error and disables Save when the from-number is the override WhatsApp number', () => {
    const input = renderChatmaid({ phone: '+15550100100', whatsappPhone: FROM });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: FROM } });
    expect(screen.getByRole('alert')).toHaveTextContent('same as the WhatsApp number in Communications override');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
  });

  it('names the override phone when it is the blank-WhatsApp fallback', () => {
    const input = renderChatmaid({ phone: FROM, whatsappPhone: '' });
    fireEvent.change(input, { target: { value: FROM } });
    expect(screen.getByRole('alert')).toHaveTextContent('same as the override phone');
    expect(saveButton()).toBeDisabled();
  });

  it('clears the error and re-enables Save for a different number', () => {
    const input = renderChatmaid({ phone: '+15550100100', whatsappPhone: FROM });
    fireEvent.change(input, { target: { value: FROM } });
    fireEvent.change(input, { target: { value: '+2348031234567' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('shows the same error for the Twilio from-number field', () => {
    render(<ConnectionSettings initial={disconnected} siteUrl="http://localhost:3000" overrideNumbers={{ phone: '', whatsappPhone: FROM }} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'twilio' } });
    fireEvent.change(screen.getByPlaceholderText('+15551234567'), { target: { value: FROM } });
    expect(screen.getByRole('alert')).toHaveTextContent('same as the WhatsApp number in Communications override');
    expect(saveButton()).toBeDisabled();
  });
});

describe('Testing section (communications override) from-number conflict (#904)', () => {
  const state = {
    environment: 'staging', isProduction: false, storedEnabled: true, effectiveEnabled: true,
    email: 'o@example.test', phone: '+15550100100', whatsappPhone: '', whatsappFromNumber: FROM,
    debugMode: false, debugExpiresAt: null, debugEffective: false, debugExpiryUnparseable: false,
    debugMissingExpiry: false, debugDurationMinutes: 60,
  };

  beforeEach(() => {
    mocks.state = state;
  });
  afterEach(cleanup);

  async function renderPage() {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TestingSection />
      </QueryClientProvider>
    );
    const phone = await screen.findByLabelText('Override phone (SMS and WhatsApp)');
    // Testing starts collapsed (#934); open it so its alerts are reachable by role.
    fireEvent.click(screen.getByRole('button', { name: 'Testing' }));
    return {
      phone,
      whatsapp: screen.getByLabelText('WhatsApp number (optional)'),
      save: screen.getByRole('button', { name: 'Save Testing' }),
    };
  }

  it('flags the WhatsApp number field and disables Save when it equals the from-number', async () => {
    const { whatsapp, save } = await renderPage();
    fireEvent.change(whatsapp, { target: { value: FROM } });
    expect(screen.getByRole('alert')).toHaveTextContent('override WhatsApp number is the same as the WhatsApp from-number');
    expect(whatsapp).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();
  });

  it('flags the phone field when it equals the from-number and the WhatsApp number is blank', async () => {
    const { phone, save } = await renderPage();
    fireEvent.change(phone, { target: { value: FROM } });
    expect(screen.getByRole('alert')).toHaveTextContent('override phone is the same as the WhatsApp from-number');
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();
  });

  it('does not flag the phone when a different WhatsApp number is set', async () => {
    const { phone, whatsapp, save } = await renderPage();
    fireEvent.change(whatsapp, { target: { value: '+15550100200' } });
    fireEvent.change(phone, { target: { value: FROM } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it('shows no error when no WhatsApp provider is connected (blank from-number)', async () => {
    mocks.state = { ...state, whatsappFromNumber: '' };
    const { whatsapp, save } = await renderPage();
    fireEvent.change(whatsapp, { target: { value: FROM } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });
});
