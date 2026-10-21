import { describe, expect, it } from 'vitest';
import { Mail } from 'lucide-react';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { SettingsGroup } from '@/config/settings-nav';
import { flattenSettingsItems, matchSettingsEntries } from '@/lib/search/settings-search-entries';

const groups: SettingsGroup[] = [
  {
    title: 'Communications',
    icon: Mail,
    items: [
      {
        title: 'Email sending',
        href: '/settings/email',
        permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
        sections: [
          {
            id: 'channels',
            title: 'Channels',
            permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
            rows: [{ id: 'send-email', label: 'Send email', keywords: ['smtp', 'outbound'] }],
          },
          { id: 'testing', title: 'Testing', rows: [{ id: 'test-recipient', label: 'Test recipient' }] },
        ],
      },
    ],
  },
];

const entries = groups.flatMap((g) => flattenSettingsItems(g.items, g.title));
const rowEntry = (title: string) => entries.find((e) => e.title === title);

describe('row-level search entries (#932)', () => {
  it('links to the row and its section, titled by the row label', () => {
    const e = rowEntry('Send email');
    expect(e?.href).toBe('/settings/email?row=send-email#channels');
    expect(e?.subtitle).toBe('Email sending › Channels');
  });

  it('uses the section permissions, else the item permissions', () => {
    expect(rowEntry('Send email')?.permissions).toEqual([PERMISSIONS.NOTIFICATIONS_MANAGE]);
    expect(rowEntry('Test recipient')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
  });

  it('finds a row by keyword, and nothing for an unrelated query', () => {
    expect(matchSettingsEntries(entries, 'smtp').map((e) => e.title)).toEqual(['Send email']);
    expect(matchSettingsEntries(entries, 'zebra')).toEqual([]);
  });
});
