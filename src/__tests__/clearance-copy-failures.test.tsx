// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mocks } = vi.hoisted(() => ({ mocks: { permissions: [] as string[] } }));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ hasPermission: (p: string) => mocks.permissions.includes(p) }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/whatsapp/admin-console', () => ({ retryWhatsAppClearanceCopy: vi.fn() }));

import { ClearanceCopyFailures } from '@/app/(dashboard)/(oversight)/system/whatsapp-monitoring/clearance-copy-failures';

const rows = [
  {
    id: 'copy-1',
    error: 'not opted in',
    attempts: 2,
    updated_at: '2026-10-20T10:00:00Z',
    recipient: { first_name: 'Ada', last_name: 'Bello', resident_code: 'RES001' },
    document: { title: 'Clearance certificate CLR-202610-3F9A1C' },
  },
];

afterEach(() => cleanup());

describe('ClearanceCopyFailures (#816 decision 24)', () => {
  it('lists the failed copy with its reason, and offers Retry to a manager only', () => {
    mocks.permissions = ['whatsapp.view'];
    render(<ClearanceCopyFailures rows={rows} />);
    expect(screen.getByText('Ada Bello')).toBeInTheDocument();
    expect(screen.getByText('not opted in')).toBeInTheDocument();
    expect(screen.getByText('Clearance certificate CLR-202610-3F9A1C')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    cleanup();
    mocks.permissions = ['whatsapp.view', 'whatsapp.manage'];
    render(<ClearanceCopyFailures rows={rows} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('says every copy was sent when none failed', () => {
    mocks.permissions = ['whatsapp.manage'];
    render(<ClearanceCopyFailures rows={[]} />);
    expect(screen.getByText('Every certificate copy was sent.')).toBeInTheDocument();
  });
});
