// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/whatsapp/identity', () => ({
  importWhatsAppOptIns: vi.fn(),
  resetWhatsAppSession: vi.fn(),
  setWhatsAppForcePin: vi.fn(),
  updateWhatsAppPendingContact: vi.fn(),
}));
vi.mock('@/actions/whatsapp/pilot', () => ({
  promoteWhatsAppPilotToEstate: vi.fn(),
  updateWhatsAppPilotSettings: vi.fn(),
  setWhatsAppEnabled: vi.fn(),
}));
vi.mock('@/actions/whatsapp/connection', () => ({
  saveWhatsAppCredentials: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  testWhatsAppConnection: vi.fn(),
  getWhatsAppConnectionStatus: vi.fn(),
  updateWhatsAppTemplateContentSids: vi.fn(),
}));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { ConnectionSettings } from '@/app/(dashboard)/settings/whatsapp/connection-settings';
import { ForcePinToggle } from '@/app/(dashboard)/settings/whatsapp/force-pin-toggle';
import { OperationsConsole } from '@/app/(dashboard)/settings/whatsapp/operations-console';
import { OptInImport } from '@/app/(dashboard)/settings/whatsapp/opt-in-import';
import { PilotControls } from '@/app/(dashboard)/settings/whatsapp/pilot-controls';
import { WhatsAppEnabledToggle } from '@/app/(dashboard)/settings/whatsapp/whatsapp-enabled-toggle';

const status = {
  connected: true,
  provider: 'twilio' as const,
  phoneNumberId: null,
  fromNumber: '+2348000000000',
  apiVersion: null,
  updatedAt: null,
  updatedByName: null,
  hasAccessToken: false,
  hasVerifyToken: false,
  hasAppSecret: false,
  hasAuthToken: true,
  hasChatmaidApiKey: false,
  hasChatmaidWebhookSecret: false,
  templateContentSids: null,
};

const person = { first_name: 'Ada', last_name: 'Okoro', resident_code: 'RES001' };

function Page() {
  return (
    <div>
      <ConnectionSettings initial={status} siteUrl="http://localhost:3000" />
      <WhatsAppEnabledToggle initialValue={true} />
      <ForcePinToggle initialValue={false} />
      <OptInImport />
      <PilotControls
        initial={{
          mode: 'pilot',
          residentIds: [],
          streetId: '',
          outboundDailyCap: 100,
          outboundBurstCap: 20,
          outboundBurstWindowMinutes: 10,
          financialLookupDailyCap: 50,
          sessionRetentionDays: 1,
          processedMessageRetentionDays: 2,
          surveyResponseRetentionDays: 90,
        }}
        residentOptions={[{ id: 'res-1', name: 'Ada Okoro', detail: 'RES001 · 12 Palm Close' }]}
      />
      <OperationsConsole
        optIns={[]}
        pending={[{ phone_number: '+2348000000001', status: 'pending', source: 'bot', first_seen_at: '2026-10-01T00:00:00Z', last_seen_at: '2026-10-01T00:00:00Z', resident: null }]}
        sessions={[{ phone_number: '+2348000000002', current_node: 'menu', pin_authenticated: false, selected_house_id: null, expires_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', resident: person, house: null }]}
        disclosures={[]}
        health={{ inboundToday: 0, outboundToday: 0, deliveryFailuresToday: 0, templateErrorsToday: 0, capLimitEventsToday: 0 }}
      />
    </div>
  );
}

/** Every write control the page can render, by accessible name. */
const WRITE_CONTROLS: [string, RegExp][] = [
  ['button', /^Disconnect$/],
  ['button', /^Replace credentials$/],
  ['button', /^Test connection$/],
  ['button', /^Save template content SIDs$/],
  ['button', /^Save rollout controls$/],
  ['button', /^Promote estate-wide$/],
  ['button', /^Choose pilot residents$/],
  ['button', /^Import opt-ins$/],
  ['button', /^Attach$/],
  ['button', /^Ignore$/],
  ['button', /^Reset$/],
  ['switch', /Enable the WhatsApp channel/],
  ['switch', /Require PIN/],
];

beforeEach(() => {
  mocks.permissions = [];
});
afterEach(() => cleanup());

describe('WhatsApp settings permission gating (issue #7)', () => {
  it('renders no enabled write control for a whatsapp.view-only user, but keeps the read-only displays', () => {
    mocks.permissions = [PERMISSIONS.WHATSAPP_VIEW];
    render(<Page />);

    for (const [role, name] of WRITE_CONTROLS) {
      const found = screen.queryAllByRole(role, { name });
      for (const control of found) expect(control).toBeDisabled();
    }
    // Controls that are hidden outright, not merely disabled.
    expect(screen.queryByRole('button', { name: /^Disconnect$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reset$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Attach$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Import opt-ins$/ })).toBeNull();

    // Read-only content is still there.
    expect(screen.getByText(/Twilio.*connected/)).toBeInTheDocument();
    expect(screen.getByText('Pending contacts')).toBeInTheDocument();
    expect(screen.getByText('Active sessions')).toBeInTheDocument();
  });

  it('renders no enabled write control while permissions are unknown (loading / none)', () => {
    mocks.permissions = [];
    render(<Page />);
    for (const [role, name] of WRITE_CONTROLS) {
      for (const control of screen.queryAllByRole(role, { name })) expect(control).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: /^Disconnect$/ })).toBeNull();
  });

  it('enables the write controls for a whatsapp.manage user', () => {
    mocks.permissions = [PERMISSIONS.WHATSAPP_VIEW, PERMISSIONS.WHATSAPP_MANAGE];
    render(<Page />);

    for (const name of [/^Disconnect$/, /^Test connection$/, /^Save template content SIDs$/, /^Save rollout controls$/, /^Promote estate-wide$/, /^Choose pilot residents$/, /^Ignore$/, /^Reset$/, /^Import opt-ins$/]) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
    expect(screen.getByRole('switch', { name: /Enable the WhatsApp channel/ })).toBeEnabled();
    expect(screen.getByRole('switch', { name: /Require PIN/ })).toBeEnabled();
  });
});
