// @vitest-environment jsdom
//
// #121: each vehicle control on the contact detail page is gated on the
// permission its server action enforces (CORE.md section 6):
// add = security.register_contacts (createVehicle), set primary and edit =
// security.update_contacts (setPrimaryVehicle, updateVehicle), remove =
// security.suspend_revoke (deactivateVehicle). A view-only role sees the
// plates and no write controls.

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisitorVehicle } from '@/types/database';

const vehicles: VisitorVehicle[] = [
  {
    id: 'v-1',
    contact_id: 'contact-1',
    plate_number: 'LAG123AB',
    vehicle_type: 'car',
    make: 'Toyota',
    model: 'Corolla',
    color: 'Blue',
    is_primary: true,
    is_active: true,
  },
  {
    id: 'v-2',
    contact_id: 'contact-1',
    plate_number: 'KJA456CD',
    vehicle_type: 'van',
    make: null,
    model: null,
    color: null,
    is_primary: false,
    is_active: true,
  },
] as unknown as VisitorVehicle[];

const mutationStub = { mutateAsync: vi.fn(), isPending: false };

function mockHooks(permissions: Record<string, boolean>) {
  vi.doMock('@/hooks/use-security', () => ({
    useCurrentUserSecurityPermissions: () => ({ data: { permissions } }),
    useContactVehicles: () => ({ data: vehicles, isLoading: false }),
    useCreateVehicle: () => mutationStub,
    useUpdateVehicle: () => mutationStub,
    useSetPrimaryVehicle: () => mutationStub,
    useDeactivateVehicle: () => mutationStub,
  }));
}

async function renderCard(permissions: Record<string, boolean>, contactActive = true) {
  mockHooks(permissions);
  const { ContactVehiclesCard } = await import('@/components/security/contact-vehicles-card');
  render(<ContactVehiclesCard contactId="contact-1" contactActive={contactActive} />);
}

describe('ContactVehiclesCard permission gating (#121)', () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock('@/hooks/use-security');
  });

  it('renders nothing without security.view', async () => {
    await renderCard({ view_contacts: false });
    expect(screen.queryByText('Vehicles')).not.toBeInTheDocument();
  }, 30000);

  it('shows plates but no write controls to a view-only role', async () => {
    await renderCard({ view_contacts: true });
    expect(screen.getByText('LAG123AB')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /as primary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit /i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove /i })).not.toBeInTheDocument();
  }, 30000);

  it('gates each control on its own action permission', async () => {
    await renderCard({ view_contacts: true, register_contacts: true });
    expect(screen.getByRole('button', { name: /add vehicle/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /as primary/i })).not.toBeInTheDocument();
    cleanup();
    vi.resetModules();

    await renderCard({ view_contacts: true, update_contacts: true });
    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument();
    // Only the non-primary vehicle offers "set as primary".
    expect(screen.getAllByRole('button', { name: /as primary/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Set KJA456CD as primary' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^edit /i })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^remove /i })).not.toBeInTheDocument();
    cleanup();
    vi.resetModules();

    await renderCard({ view_contacts: true, suspend_revoke_contacts: true });
    expect(screen.getAllByRole('button', { name: /^remove /i })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^edit /i })).not.toBeInTheDocument();
  }, 30000);

  it('hides Add Vehicle for an inactive contact', async () => {
    await renderCard({ view_contacts: true, register_contacts: true }, false);
    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument();
  }, 30000);
});
