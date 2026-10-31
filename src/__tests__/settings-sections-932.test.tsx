// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Mail } from 'lucide-react';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { findSettingsRow, flattenSettingsRows, type SettingsGroup } from '@/config/settings-nav';

const push = vi.fn();
const replace = vi.fn();
let rowParam: string | null = null;
let sectionParam: string | null = null;
let held: string[] = [PERMISSIONS.SETTINGS_MANAGE_GENERAL];
let authLoading = false;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/settings/email',
  useSearchParams: () =>
    new URLSearchParams({ ...(rowParam ? { row: rowParam } : {}), ...(sectionParam ? { section: sectionParam } : {}) }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: authLoading, hasAnyPermission: (p: string[]) => p.some((x) => held.includes(x)) }),
}));

import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsPageNav } from '@/components/settings/settings-page-nav';
import { SettingsSectionsProvider } from '@/components/settings/settings-sections-provider';

const groups: SettingsGroup[] = [
  {
    title: 'Communications',
    icon: Mail,
    items: [
      {
        title: 'Email sending',
        href: '/settings/email',
        sections: [
          { id: 'channels', title: 'Channels', rows: [{ id: 'send-email', label: 'Send email', help: 'Turns all email on or off.' }] },
          { id: 'testing', title: 'Testing', rows: [{ id: 'test-recipient', label: 'Test recipient' }] },
        ],
      },
    ],
  },
];

/** A section whose draft is local: the edit button makes it dirty, Save clears it. */
function Harness({
  id,
  title,
  permissions,
  canSave = true,
  defaultCollapsed,
  withRow,
}: {
  id: string;
  title: string;
  permissions?: string[];
  canSave?: boolean;
  defaultCollapsed?: boolean;
  withRow?: string;
}) {
  const [dirty, setDirty] = React.useState(false);
  return (
    <SettingsSection
      id={id}
      title={title}
      summary="Currently on"
      permissions={permissions as never}
      defaultCollapsed={defaultCollapsed}
      canSave={canSave}
      saveBlockedReason="Enter a valid address."
      isDirty={dirty}
      onSave={async () => {
        setDirty(false);
      }}
      onDiscard={() => setDirty(false)}
    >
      {withRow ? (
        <SettingsRow rowId={withRow}>{({ controlId }) => <input id={controlId} />}</SettingsRow>
      ) : (
        <button onClick={() => setDirty(true)}>edit {title}</button>
      )}
    </SettingsSection>
  );
}
const edit = (title: string) => fireEvent.click(screen.getByRole('button', { name: `edit ${title}` }));
/** Opens a tab when the page has tabs (#1365). */
const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  rowParam = null;
  sectionParam = null;
  authLoading = false;
  held = [PERMISSIONS.SETTINGS_MANAGE_GENERAL];
});
afterEach(cleanup);

describe('registry helpers', () => {
  it('finds a row with its item and section, and flattens every row', () => {
    const hit = findSettingsRow('test-recipient', groups);
    expect([hit?.item.title, hit?.section.id]).toEqual(['Email sending', 'testing']);
    expect(findSettingsRow('nope', groups)).toBeNull();
    expect(flattenSettingsRows(groups).map((m) => m.row.id)).toEqual(['send-email', 'test-recipient']);
  });

  it('SettingsRow throws for an id that is not in the registry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <SettingsRow rowId="not-a-row">
          <input />
        </SettingsRow>,
      ),
    ).toThrow(/not-a-row/);
  });

  it('SettingsRow takes its label and help from the registry and links the help', () => {
    render(
      <SettingsSectionsProvider groups={groups}>
        <SettingsRow rowId="send-email">{({ controlId }) => <input id={controlId} />}</SettingsRow>
      </SettingsSectionsProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Send email' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Send email' })).toHaveAccessibleDescription('Turns all email on or off.');
  });
});

describe('SettingsSection', () => {
  it('renders nothing without its permission', () => {
    render(<Harness id="channels" title="Channels" permissions={[PERMISSIONS.NOTIFICATIONS_MANAGE]} />);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.queryByText('No changes')).toBeNull();
  });

  it('puts the toggle button inside the h2 and shows the footer only while open (#971)', () => {
    render(<Harness id="channels" title="Channels" defaultCollapsed />);
    const button = within(screen.getByRole('heading', { level: 2 })).getByRole('button', { name: 'Channels' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAccessibleDescription('Currently on');
    expect(screen.queryByText('No changes')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Channels' })).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('No changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Channels' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('shows Unsaved changes when dirty, then Saved after the save resolves', async () => {
    render(<Harness id="channels" title="Channels" />);
    edit('Channels');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Channels' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Channels' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('says why Save is blocked and disables it', () => {
    render(<Harness id="channels" title="Channels" canSave={false} />);
    edit('Channels');
    expect(screen.getByText('Enter a valid address.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Channels' })).toBeDisabled();
  });

  it.each([
    ['returns false', async () => false],
    [
      'throws',
      async () => {
        throw new Error('boom');
      },
    ],
  ])('does not claim Saved when the save %s', async (_name, result) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Clearing() {
      const [dirty, setDirty] = React.useState(true);
      return (
        <SettingsSection
          id="c"
          title="Channels"
          summary="s"
          isDirty={dirty}
          onSave={async () => {
            setDirty(false);
            return result();
          }}
          onDiscard={() => {}}
        >
          x
        </SettingsSection>
      );
    }
    render(<Clearing />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Channels' }));
    await screen.findByText('No changes');
    // Let the save promise settle before checking that "Saved" never appears.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('prevents unload only while a section is dirty', () => {
    render(
      <SettingsSectionsProvider groups={groups}>
        <Harness id="channels" title="Channels" />
      </SettingsSectionsProvider>,
    );
    const fire = () => {
      const ev = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(fire()).toBe(false);
    edit('Channels');
    expect(fire()).toBe(true);
  });
});

describe('SettingsSectionsProvider', () => {
  const page = () =>
    render(
      <SettingsSectionsProvider groups={groups}>
        <SettingsPageNav />
        <a href="/settings/other">Other page</a>
        <Harness id="channels" title="Channels" />
        <Harness id="testing" title="Testing" />
      </SettingsSectionsProvider>,
    );

  it('saves two dirty sections independently, and an edit survives a tab switch (#1365)', async () => {
    page();
    openTab('Channels');
    edit('Channels');
    openTab('Testing');
    edit('Testing');
    openTab('Channels (unsaved)');
    const channels = screen.getByRole('region', { name: 'Channels' });
    fireEvent.click(within(channels).getByRole('button', { name: 'Save Channels' }));
    await within(channels).findByText('Saved');
    openTab('Testing (unsaved)');
    expect(within(screen.getByRole('region', { name: 'Testing' })).getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('names both dirty sections in the dialog on an in-app link, and Stay keeps the page', async () => {
    page();
    openTab('Channels');
    edit('Channels');
    openTab('Testing');
    edit('Testing');
    expect(fireEvent.click(screen.getByRole('link', { name: 'Other page' }))).toBe(false);
    expect(await screen.findByText(/Channels and Testing have unsaved changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay on this page' }));
    await waitFor(() => expect(screen.queryByText(/have unsaved changes/)).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it('Leave without saving navigates; Save and leave is off when a section cannot save', async () => {
    render(
      <SettingsSectionsProvider groups={groups}>
        <a href="/settings/other">Other page</a>
        <Harness id="channels" title="Channels" canSave={false} />
      </SettingsSectionsProvider>,
    );
    edit('Channels');
    fireEvent.click(screen.getByRole('link', { name: 'Other page' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Save and leave' })).toBeDisabled();
    expect(within(dialog).getByText(/Enter a valid address/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave without saving' }));
    expect(push).toHaveBeenCalledWith('/settings/other');
  });

  it('does not intercept links while every section is clean', () => {
    page();
    expect(fireEvent.click(screen.getByRole('link', { name: 'Other page' }))).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('opens a collapsed section and focuses the row for ?row=, with an announcement', async () => {
    rowParam = 'test-recipient';
    render(
      <SettingsSectionsProvider groups={groups}>
        <Harness id="testing" title="Testing" defaultCollapsed withRow="test-recipient" />
      </SettingsSectionsProvider>,
    );
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Test recipient' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Testing' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('test-recipient')).toHaveAttribute('data-hit', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Test recipient, in Testing');
    fireEvent.pointerDown(document.body);
    expect(document.getElementById('test-recipient')).not.toHaveAttribute('data-hit');
  });
});

describe('?row= while auth loads', () => {
  const tree = () => (
    <SettingsSectionsProvider groups={groups}>
      <Harness id="testing" title="Testing" defaultCollapsed withRow="test-recipient" />
    </SettingsSectionsProvider>
  );

  it('finds, highlights, focuses and announces the row once auth has loaded', async () => {
    rowParam = 'test-recipient';
    authLoading = true;
    const { rerender } = render(tree());
    expect(document.getElementById('test-recipient')).toBeNull();
    // Let a few animation frames run while loading, so the row is found only by a retry.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    authLoading = false;
    rerender(tree());
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Test recipient' })).toHaveFocus());
    expect(document.getElementById('test-recipient')).toHaveAttribute('data-hit', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Test recipient, in Testing');
  });

  it('stops after the retry limit without throwing or announcing when the row never appears', () => {
    vi.useFakeTimers();
    let raf: ReturnType<typeof vi.spyOn> | undefined;
    try {
      rowParam = 'test-recipient';
      authLoading = true;
      raf = vi.spyOn(window, 'requestAnimationFrame');
      expect(() => render(tree())).not.toThrow();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(document.querySelector('[data-hit]')).toBeNull();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(raf.mock.calls.length).toBeLessThan(80);
    } finally {
      // The spy wraps the fake rAF; left in place, later tests' frames never run.
      raf?.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('SettingsPageNav', () => {
  it('has a tab per visible section only', () => {
    held = [];
    render(
      <SettingsSectionsProvider groups={groups}>
        <SettingsPageNav />
        <Harness id="channels" title="Channels" permissions={[PERMISSIONS.NOTIFICATIONS_MANAGE]} />
        <Harness id="testing" title="Testing" />
      </SettingsSectionsProvider>,
    );
    // One visible section: no tabs, the section shows on its own.
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Channels' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Testing' })).toBeVisible();
  });

  it('adds "(unsaved)" to a dirty section tab', () => {
    render(
      <SettingsSectionsProvider groups={groups}>
        <SettingsPageNav />
        <Harness id="channels" title="Channels" />
        <Harness id="testing" title="Testing" />
      </SettingsSectionsProvider>,
    );
    openTab('Testing');
    edit('Testing');
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getByRole('tab', { name: 'Testing (unsaved)' })).toBeInTheDocument();
    expect(within(nav).getByRole('tab', { name: 'Channels' })).toBeInTheDocument();
  });
});

describe('tabs with a Summary tab first (#1365)', () => {
  const page = () =>
    render(
      <SettingsSectionsProvider groups={groups}>
        <SettingsPageNav />
        <Harness id="channels" title="Channels" />
        <Harness id="testing" title="Testing" />
      </SettingsSectionsProvider>,
    );

  it('opens on Summary: one card per section, every section hidden', () => {
    page();
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    const summary = screen.getByRole('tabpanel', { name: 'Summary' });
    expect(within(summary).getByRole('button', { name: /Channels/ })).toHaveTextContent('Currently on');
    expect(within(summary).getByRole('button', { name: /Testing/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Channels' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Testing' })).toBeNull();
  });

  it('a Summary card opens its tab, shows only that section and writes ?section=', () => {
    page();
    fireEvent.click(within(screen.getByRole('tabpanel', { name: 'Summary' })).getByRole('button', { name: /Testing/ }));
    expect(screen.getByRole('tab', { name: 'Testing' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Testing' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Channels' })).toBeNull();
    expect(document.getElementById('section-summary')).not.toBeVisible();
    expect(replace).toHaveBeenLastCalledWith('/?section=testing', { scroll: false });
  });

  it('?section= opens that tab; an unknown one falls back to Summary', () => {
    sectionParam = 'channels';
    page();
    expect(screen.getByRole('region', { name: 'Channels' })).toBeVisible();
    cleanup();
    sectionParam = 'nope';
    page();
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks a dirty section on its Summary card and keeps the leave guard', async () => {
    page();
    openTab('Testing');
    edit('Testing');
    openTab('Summary (unsaved)');
    expect(within(screen.getByRole('tabpanel', { name: 'Summary' })).getByRole('button', { name: /Testing/ })).toHaveTextContent('Unsaved');
    render(<a href="/settings/other">Other page</a>);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Other page' }))).toBe(false);
    expect(await screen.findByText(/Testing has unsaved changes/)).toBeInTheDocument();
  });

  it('?row= opens the tab of the row\'s section', async () => {
    rowParam = 'test-recipient';
    render(
      <SettingsSectionsProvider groups={groups}>
        <SettingsPageNav />
        <Harness id="channels" title="Channels" />
        <Harness id="testing" title="Testing" defaultCollapsed withRow="test-recipient" />
      </SettingsSectionsProvider>,
    );
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Test recipient' })).toHaveFocus());
    expect(screen.getByRole('tab', { name: 'Testing' })).toHaveAttribute('aria-selected', 'true');
  });
});
