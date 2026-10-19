import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSettings: vi.fn(),
  useTestEmail: vi.fn(),
  useSendPaymentReminders: vi.fn(),
}));
vi.mock('@/hooks/use-settings', () => ({ useSettings: mocks.useSettings }));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('@/actions/email/send-payment-reminders', () => ({ previewPaymentReminders: vi.fn() }));
vi.mock('@/hooks/use-email', () => ({
  useTestEmail: mocks.useTestEmail,
  useSendPaymentReminders: mocks.useSendPaymentReminders,
}));

import EmailDebugPage from '@/app/(dashboard)/settings/email/debug/page';
import { settingsConfig, type SettingsItem } from '@/config/settings-nav';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function render(): string {
  mocks.useSettings.mockReturnValue({ data: [], isLoading: false });
  mocks.useTestEmail.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useSendPaymentReminders.mockReturnValue({ mutate: vi.fn(), isPending: false });
  return renderToStaticMarkup(createElement(EmailDebugPage));
}

function allItems(items: SettingsItem[]): SettingsItem[] {
  return items.flatMap((item) => (item.children ? [item, ...allItems(item.children)] : [item]));
}

describe('/settings/email/debug (Debug & Testing)', () => {
  it('is titled Debug & Testing and keeps the two manual tools', () => {
    const html = render();
    expect(html).toContain('Debug &amp; Testing');
    expect(html).toContain('Send Reminders');
    expect(html).toContain('Send Test');
  });

  it('no longer carries the email debug switch', () => {
    const html = render();
    expect(html).not.toContain('Enable Debug Mode');
    expect(html).not.toContain('role="switch"');
  });

  it('says the debug switch moved to Communications override > Debug Mode, with a link', () => {
    const html = render();
    expect(html).toContain('href="/settings/comms-override#debug-mode"');
    expect(html).toContain('Communications override');
  });

  it('says the tools are redirected outside production and blocked with a blank override email', () => {
    const html = render().replace(/\s+/g, ' ');
    expect(html).toContain('Outside production');
    expect(html).toContain('redirected to the override contacts');
    expect(html).toContain('blocked if the override email is blank');
    expect(html).toContain('In production they go to the real recipients unless Debug Mode is on');
  });
});

describe('settings nav', () => {
  it('still lists Debug & Testing under Email Notifications with the same permission', () => {
    const items = allItems(settingsConfig.flatMap((group) => group.items));
    const entry = items.find((i) => i.href === '/settings/email/debug');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Debug & Testing');
    expect(entry?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    const parent = items.find((i) => i.href === '/settings/email' && i.children);
    expect(parent?.children?.map((c) => c.href)).toContain('/settings/email/debug');
  });
});
