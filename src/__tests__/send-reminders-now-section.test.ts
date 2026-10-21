import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSettings: vi.fn(),
  useSendPaymentReminders: vi.fn(),
}));
vi.mock('@/hooks/use-settings', () => ({ useSettings: mocks.useSettings }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/actions/email/send-payment-reminders', () => ({ previewPaymentReminders: vi.fn() }));
vi.mock('@/hooks/use-email', () => ({ useSendPaymentReminders: mocks.useSendPaymentReminders }));

import { SendRemindersNowSection } from '@/components/settings/messages/send-reminders-test-section';
import { settingsConfig, flattenSettingsNav } from '@/config/settings-nav';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function render(): string {
  mocks.useSettings.mockReturnValue({ data: [], isLoading: false });
  mocks.useSendPaymentReminders.mockReturnValue({ mutate: vi.fn(), isPending: false });
  return renderToStaticMarkup(createElement(SendRemindersNowSection));
}

describe('/settings/reminders "Send now" section (was /settings/email/debug, #934)', () => {
  it('keeps the manual reminder run and carries no debug switch', () => {
    const html = render();
    expect(html).toContain('id="send-test"');
    expect(html).toContain('Send Reminders');
    expect(html).not.toContain('Enable Debug Mode');
  });

  it('says the reminders are redirected outside production and blocked with a blank override email', () => {
    const html = render().replace(/\s+/g, ' ');
    expect(html).toContain('Outside production');
    expect(html).toContain('redirected to the override contacts');
    expect(html).toContain('blocked if the override email is blank');
    expect(html).toContain('In production they go to the real recipients unless Debug Mode is on');
  });
});

describe('settings nav', () => {
  const items = flattenSettingsNav(settingsConfig);
  const section = (href: string, id: string) => items.find((i) => i.href === href)?.sections?.find((s) => s.id === id);

  it('keeps the manual reminder run on settings.manage_general, as the Email Debug page had (#786)', () => {
    expect(section('/settings/reminders', 'send-test')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
  });

  it('keeps the test email and the redirect together in a collapsed Testing section on the same permission', () => {
    const testing = section('/settings/sending', 'testing');
    expect(testing?.defaultCollapsed).toBe(true);
    expect(testing?.rows.map((r) => r.id)).toEqual(
      expect.arrayContaining(['redirect-all', 'override-contacts', 'debug-mode', 'test-email'])
    );
    expect(items.find((i) => i.href === '/settings/sending')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
  });
});
