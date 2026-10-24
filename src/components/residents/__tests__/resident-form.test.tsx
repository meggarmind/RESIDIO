// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  createAsync: vi.fn(async (_vars: unknown) => ({})),
  updateAsync: vi.fn(async (_vars: unknown) => ({})),
  push: vi.fn(),
  houseResidents: undefined as { resident_role: string; id: string }[] | undefined,
  permissions: new Set<string>(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, back: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (p: string) => mocks.permissions.has(p) }),
}));
vi.mock('@/hooks/use-houses', () => ({
  useHousesWithRoles: () => ({ data: { data: [] }, isLoading: false }),
  useHouseResidents: () => ({ data: mocks.houseResidents }),
}));
vi.mock('@/hooks/use-residents', () => ({
  useResidentOptions: () => ({ data: { data: [] }, isLoading: false }),
  useCreateResident: () => ({ mutateAsync: mocks.createAsync, isPending: false }),
  useUpdateResident: () => ({ mutateAsync: mocks.updateAsync, isPending: false }),
  DuplicateResidentError: class DuplicateResidentError extends Error {},
}));

import { ResidentForm } from '@/components/residents/resident-form';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { FLAG_OPTION_LABELS } from '@/lib/comms-override/resident-flag-ui';
import type { Resident } from '@/types/database';

const HOUSE = '22222222-2222-4222-8222-222222222222';

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.houseResidents = undefined;
  mocks.permissions = new Set();
});

const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

const choose = (trigger: HTMLElement, option: string) => {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
};

const fillRequired = () => {
  type('John', 'Ada');
  type('Doe', 'Obi');
  type('08012345678', '08012345678');
};

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
const stepNow = () => screen.getByRole('navigation', { name: 'Progress' }).querySelector('[aria-current="step"]');

const existing = (over: Partial<Resident> = {}) =>
  ({
    id: 'r1', first_name: 'Ada', last_name: 'Obi', email: '', phone_primary: '08012345678', phone_secondary: '',
    resident_type: 'primary', entity_type: 'individual', company_name: '', rc_number: '', liaison_contact_name: '',
    liaison_contact_phone: '', emergency_contact_name: '', emergency_contact_phone: '',
    emergency_contact_relationship: '', emergency_contact_resident_id: null, notes: '', ...over,
  }) as unknown as Resident;

describe('ResidentForm create wizard (#1135)', () => {
  it('blocks the first step while the primary phone is empty', async () => {
    render(<ResidentForm />);
    type('John', 'Ada');
    type('Doe', 'Obi');
    next();

    expect(await screen.findByText('Phone number must be at least 10 digits')).toBeInTheDocument();
    expect(stepNow()).toHaveTextContent('Personal Information');
  });

  it('catches a corporate entity with no company name on the client, not at the server', async () => {
    render(<ResidentForm />);
    fillRequired();
    next();
    await waitFor(() => expect(stepNow()).toHaveTextContent('House Assignment'));
    next();
    await waitFor(() => expect(stepNow()).toHaveTextContent('Entity Type'));
    choose(screen.getByRole('combobox'), 'Corporate Entity');
    next();

    expect(await screen.findByText('Company name is required for corporate entities')).toBeInTheDocument();
    expect(stepNow()).toHaveTextContent('Entity Type');
    expect(mocks.createAsync).not.toHaveBeenCalled();
  });

  it('creates from the required step alone, skipping every optional step', async () => {
    render(<ResidentForm />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create Resident' }));

    await waitFor(() => expect(mocks.createAsync).toHaveBeenCalledTimes(1));
    expect(mocks.createAsync.mock.calls[0][0]).toMatchObject({
      data: { first_name: 'Ada', last_name: 'Obi', phone_primary: '08012345678', resident_type: 'primary' },
    });
    expect(mocks.push).toHaveBeenCalledWith('/residents');
  });

  it('returns to the house it was opened from after creating', async () => {
    render(<ResidentForm preselectedHouseId={HOUSE} />);
    fillRequired();
    next();
    fireEvent.click(await screen.findByRole('button', { name: 'Create Resident' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/houses/${HOUSE}`));
    expect(mocks.createAsync.mock.calls[0][0]).toMatchObject({ data: { house_id: HOUSE } });
  });

  it('limits the type to secondary when the live house already has a tenant', async () => {
    mocks.houseResidents = [{ id: 'x', resident_role: 'tenant' }];
    render(<ResidentForm preselectedHouseId={HOUSE} />);

    expect(await screen.findByText(/This house already has a primary resident/)).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
  });

  it('allows both types when the house has only a non-resident landlord', () => {
    mocks.houseResidents = [{ id: 'x', resident_role: 'non_resident_landlord' }];
    render(<ResidentForm preselectedHouseId={HOUSE} />);

    expect(screen.queryByText(/This house already has a primary resident/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toBeEnabled();
  });
});

describe('ResidentForm edit', () => {
  it('stays a single page with every section', () => {
    render(<ResidentForm resident={existing()} />);

    expect(screen.queryByRole('navigation', { name: 'Progress' })).not.toBeInTheDocument();
    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Entity Type', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('Emergency Contact')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Any additional notes about this resident...')).toBeInTheDocument();
    expect(screen.queryByText('House Assignment')).not.toBeInTheDocument();
  });

  it('shows the stored communications flag and sends nothing when it is untouched (#716)', async () => {
    mocks.permissions = new Set([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    render(<ResidentForm resident={{ ...existing(), use_override_comms: true } as Resident} />);

    expect(screen.getByTestId('use-override-comms')).toHaveTextContent(FLAG_OPTION_LABELS.override);
    fireEvent.click(screen.getByRole('button', { name: 'Update Resident' }));

    await waitFor(() => expect(mocks.updateAsync).toHaveBeenCalledTimes(1));
    const [{ data }] = mocks.updateAsync.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(data.use_override_comms).toBeUndefined();
  });

  it('clears stale corporate fields only in the submitted payload (#1067 corporate lifecycle)', async () => {
    render(<ResidentForm resident={existing({ company_name: 'Acme Ltd', rc_number: 'RC1' })} />);
    expect(screen.queryByPlaceholderText('ABC Corporation Ltd')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update Resident' }));

    await waitFor(() => expect(mocks.updateAsync).toHaveBeenCalledTimes(1));
    const [{ data }] = mocks.updateAsync.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(data).toMatchObject({ entity_type: 'individual', company_name: '', rc_number: '' });
  });

  it('keeps corporate fields for a corporate resident', async () => {
    render(<ResidentForm resident={existing({ entity_type: 'corporate', company_name: 'Acme Ltd', rc_number: 'RC1' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Update Resident' }));

    await waitFor(() => expect(mocks.updateAsync).toHaveBeenCalledTimes(1));
    const [{ data }] = mocks.updateAsync.mock.calls[0] as unknown as [{ data: Record<string, unknown> }];
    expect(data).toMatchObject({ company_name: 'Acme Ltd', rc_number: 'RC1' });
  });
});
