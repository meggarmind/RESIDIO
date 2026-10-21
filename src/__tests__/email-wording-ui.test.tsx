// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  templates: [] as unknown[],
  mutateAsync: vi.fn(),
  provider: 'chatmaid' as string | null,
}));

vi.mock('@/actions/whatsapp/connection', () => ({
  getWhatsAppConnectionStatus: async () => ({ data: { provider: mocks.provider } }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (p: string) => mocks.permissions.includes(p) }),
}));
vi.mock('@/hooks/use-notifications', () => ({
  useNotificationTemplates: (options?: { channel?: string }) => ({
    data: (mocks.templates as Array<{ channel: string }>).filter((t) => t.channel === (options?.channel ?? 'email')),
    isLoading: false,
  }),
  useUpdateEventContent: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
// Render sheet content only while open, without Radix portals.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
// The page test only needs a way to ask for an edit; the real list is tested on its own below.
vi.mock('@/components/notifications/template-list', async (importActual) => {
  const actual = await importActual<typeof import('@/components/notifications/template-list')>();
  return {
    TemplateList: (props: Parameters<typeof actual.TemplateList>[0]) => (
      <div>
        <button onClick={() => props.onEdit?.(mocks.templates[0] as never)}>stub-edit</button>
        <actual.TemplateList {...props} />
      </div>
    ),
  };
});

import NotificationTemplatesPage from '@/app/(dashboard)/settings/notifications/templates/page';
import { TemplateForm } from '@/components/notifications/template-form';
import { TemplateList } from '@/components/notifications/template-list';
import { EVENT_KEYS } from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

const row = (event: string, overrides: Record<string, string> = {}, channel = 'email') =>
  ({
    id: `id-${event}`,
    name: event,
    display_name: event,
    category: 'general',
    channel,
    event,
    overrides,
  }) as unknown as NotificationTemplate;

beforeEach(() => {
  mocks.permissions = [];
  mocks.provider = 'chatmaid';
  mocks.templates = EVENT_KEYS.map((e) => row(e));
  mocks.mutateAsync.mockReset();
  mocks.mutateAsync.mockResolvedValue({});
});
afterEach(cleanup);

describe('template list', () => {
  it('shows an Edit button per email only with notifications.manage', () => {
    render(<TemplateList canManage={true} onEdit={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Edit/ })).toHaveLength(EVENT_KEYS.length);
    cleanup();
    render(<TemplateList canManage={false} onEdit={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Preview/ })).toHaveLength(EVENT_KEYS.length);
  });
});

describe('whatsapp tab (#908)', () => {
  beforeEach(() => {
    mocks.templates = [
      ...EVENT_KEYS.map((e) => row(e)),
      row('payment_receipt', {}, 'whatsapp'),
      row('payment_reminder', { body: 'Hi' }, 'whatsapp'),
    ];
  });

  it('lists only the two WhatsApp events, editable under Chatmaid', () => {
    render(<TemplateList channel="whatsapp" whatsappProvider="chatmaid" canManage={true} onEdit={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Edit/ })).toHaveLength(2);
    expect(screen.getByText('1 field edited')).toBeInTheDocument();
  });

  it.each(['meta', 'twilio', null])('shows the code-owned template read-only for provider %s', (provider) => {
    render(<TemplateList channel="whatsapp" whatsappProvider={provider} canManage={true} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.getByText('invoice_reminder')).toBeInTheDocument();
    expect(screen.getByText('payment_received')).toBeInTheDocument();
    expect(screen.getAllByText(/Parameters in order/)).toHaveLength(2);
    expect(screen.getByText(/\{\{resident_name\}\}, \{\{amount\}\}, \{\{payment_date\}\}, \{\{reference_number\}\}/)).toBeInTheDocument();
  });

  it('the form saves to the whatsapp channel', async () => {
    render(<TemplateForm template={row('payment_receipt', {}, 'whatsapp')} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Got {{amount}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wording' }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      event: 'payment_receipt',
      channel: 'whatsapp',
      overrides: { body: 'Got {{amount}}' },
    });
  });

  it('the form refuses a variable outside the WhatsApp list', async () => {
    render(<TemplateForm template={row('payment_receipt', {}, 'whatsapp')} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'At {{property}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wording' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('wording page', () => {
  it('does not render the edit form without notifications.manage', () => {
    render(<NotificationTemplatesPage />);
    fireEvent.click(screen.getByText('stub-edit'));
    expect(screen.queryByRole('button', { name: 'Save wording' })).toBeNull();
  });

  it('renders the edit form with notifications.manage', () => {
    mocks.permissions = ['notifications.manage'];
    render(<NotificationTemplatesPage />);
    fireEvent.click(screen.getByText('stub-edit'));
    expect(screen.getByRole('button', { name: 'Save wording' })).toBeInTheDocument();
  });
});

describe('template form', () => {
  it('Reset to default clears the field and the saved overrides omit it', async () => {
    const template = row('welcome_resident', { heading: 'Mine', sign_off: 'Bye' });
    render(<TemplateForm template={template} />);
    expect(screen.getByLabelText('Heading')).toHaveValue('Mine');

    // Fields in order: subject, heading, body, sign-off. Subject has nothing to reset.
    fireEvent.click(screen.getAllByRole('button', { name: /Reset to default/ })[1]);
    expect(screen.getByLabelText('Heading')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Save wording' }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      event: 'welcome_resident',
      channel: 'email',
      overrides: { sign_off: 'Bye' },
    });
  });

  it('shows the built-in text as the placeholder', () => {
    render(<TemplateForm template={row('payment_receipt')} />);
    expect(screen.getByLabelText('Heading')).toHaveAttribute('placeholder', 'Payment Receipt');
    expect(screen.getByLabelText('Opening message')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('Thank you for your payment')
    );
  });
});
