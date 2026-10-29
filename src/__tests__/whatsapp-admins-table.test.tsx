// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminsTable } from '@/app/(dashboard)/settings/whatsapp-admin/admins-table';
import { filterWhatsAppAdminRows, type WhatsAppAdminRow } from '@/lib/whatsapp/admin-settings';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/actions/whatsapp/admin-settings', () => ({
  linkWhatsAppAdminNumber: vi.fn(),
  setWhatsAppAdminCodeRequired: vi.fn(),
  setWhatsAppAdminGlobalCodeRequired: vi.fn(),
  unlinkWhatsAppAdminBinding: vi.fn(),
}));
vi.mock('@/actions/whatsapp/admin-access', () => ({ unlinkMyWhatsAppAdminNumber: vi.fn() }));

const row = (overrides: Partial<WhatsAppAdminRow>): WhatsAppAdminRow => ({
  bindingId: 'b', profileId: 'p', name: 'Ada Admin', roleName: 'Chairman', maskedNumber: '+234****678',
  boundAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-30T00:00:00Z', lastUsedAt: null, codeRequired: true, status: 'active', ...overrides,
});
const ROWS = [
  row({ bindingId: 'b1', profileId: 'p1', name: 'Ada Admin' }),
  row({ bindingId: 'b2', profileId: 'p2', name: 'Bayo Bello', roleName: 'Financial Officer', codeRequired: false }),
  row({ bindingId: 'b3', profileId: 'p3', name: 'Chi Eze', roleName: 'Secretary', status: 'ending' }),
];

afterEach(() => cleanup());

describe('filterWhatsAppAdminRows (#1295)', () => {
  it('searches name, role and number, and filters code-off and ending links', () => {
    expect(filterWhatsAppAdminRows(ROWS, 'financial', 'all').map((r) => r.name)).toEqual(['Bayo Bello']);
    expect(filterWhatsAppAdminRows(ROWS, '', 'code_off').map((r) => r.name)).toEqual(['Bayo Bello']);
    expect(filterWhatsAppAdminRows(ROWS, '', 'ending').map((r) => r.name)).toEqual(['Chi Eze']);
    expect(filterWhatsAppAdminRows(ROWS, '678', 'all')).toHaveLength(3);
  });
});

describe('AdminsTable (#1295)', () => {
  const props = { rows: ROWS, candidates: [], canManage: true, viewerProfileId: 'p1', globalCodeRequired: true };

  it('shows every row and narrows with search and the filter', () => {
    render(<AdminsTable {...props} />);
    expect(screen.getAllByRole('row')).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Search linked admins'), { target: { value: 'chi' } });
    expect(screen.getByText('Chi Eze')).toBeInTheDocument();
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search linked admins'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter linked admins'), { target: { value: 'code_off' } });
    expect(screen.getByText('Bayo Bello')).toBeInTheDocument();
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument();
  });

  it('gives a non-manager no switches and no link button, only an Unlink on their own row', () => {
    render(<AdminsTable {...props} canManage={false} rows={[ROWS[0]]} />);
    expect(screen.queryByText('Link a number for an admin')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Code required for Ada Admin')).toBeDisabled();
    expect(screen.getByLabelText('Code required for all admins')).toBeDisabled();
    expect(screen.getByLabelText('Unlink Ada Admin')).toBeInTheDocument();
  });
});
