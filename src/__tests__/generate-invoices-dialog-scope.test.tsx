// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Children, createContext, useContext, type ReactNode } from 'react';

const { getHouses, getStreets, getResidents } = vi.hoisted(() => ({
  getHouses: vi.fn(),
  getStreets: vi.fn(),
  getResidents: vi.fn(),
}));

vi.mock('@/hooks/use-billing', () => {
  const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return {
    useGenerateInvoicesPreview: () => mutation,
    usePrepareInvoiceGenerationRun: () => mutation,
    useProcessInvoiceGenerationRun: () => mutation,
    useApproveInvoiceGenerationRun: () => mutation,
    useInvoiceGenerationRun: () => ({ data: undefined }),
  };
});
vi.mock('@/actions/billing/apply-late-fees', () => ({ getLateFeeSettings: () => Promise.resolve({ enabled: false }) }));
vi.mock('@/actions/houses/get-houses', () => ({ getHouses }));
vi.mock('@/actions/reference/get-streets', () => ({ getStreets }));
vi.mock('@/actions/residents/get-residents', () => ({ getResidents }));

// Radix Select needs pointer APIs jsdom lacks; a native select exercises the same handlers.
vi.mock('@/components/ui/select', () => {
  const Ctx = createContext<{ value: string; onValueChange: (v: string) => void }>({ value: '', onValueChange: () => {} });
  return {
    Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: ({ 'aria-label': label }: { 'aria-label'?: string }) => <span data-label={label} />,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => {
      const { value, onValueChange } = useContext(Ctx);
      return (
        <select data-testid="native-select" value={value} onChange={(e) => onValueChange(e.target.value)}>
          {Children.toArray(children)}
        </select>
      );
    },
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
  };
});

import { GenerateInvoicesDialog } from '@/components/billing/generate-invoices-dialog';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  getStreets.mockResolvedValue({ data: [{ id: 's1', name: 'Palm Avenue' }, { id: 's2', name: 'Oak Lane' }], error: null });
  getHouses.mockResolvedValue({ data: [{ id: 'h1', house_number: '17F-2' }, { id: 'h2', house_number: '17F-10' }], count: 2, error: null });
  getResidents.mockResolvedValue({
    data: [{
      id: 'r1', first_name: 'Ada', last_name: 'Okoro', resident_code: 'RES001',
      resident_houses: [{ is_primary: true, house: { house_number: '4', street: { name: 'Palm Avenue' } } }],
    }],
    count: 1,
    error: null,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const chooseScope = (value: string) => {
  const scopeSelect = screen.getAllByTestId('native-select')[1];
  fireEvent.change(scopeSelect, { target: { value } });
};
const pick = (trigger: HTMLElement, option: string) => {
  fireEvent.click(trigger);
  fireEvent.click(screen.getByText(option));
};

describe('GenerateInvoicesDialog scope pickers (#1157)', () => {
  it('loads houses for the chosen street only, and clears the house when the street changes', async () => {
    render(<GenerateInvoicesDialog open onClose={vi.fn()} />);
    chooseScope('house');

    expect((await screen.findByText('House No.', { selector: 'button span' })).closest('button')).toBeDisabled();

    const streetTrigger = (await screen.findByText('Street', { selector: 'button span' })).closest('button') as HTMLElement;
    await waitFor(() => expect(streetTrigger).not.toBeDisabled());
    pick(streetTrigger, 'Palm Avenue');
    await waitFor(() => expect(getHouses).toHaveBeenCalledWith({ street_id: 's1', limit: 500 }));
    const houseTrigger = () => screen.getByText('House No.', { selector: 'button span' }).closest('button') as HTMLElement;
    await waitFor(() => expect(houseTrigger()).not.toBeDisabled());

    pick(houseTrigger(), '17F-10');
    expect(screen.getByText('17F-10', { selector: 'button span' })).toBeInTheDocument();

    pick(screen.getByText('Palm Avenue', { selector: 'button span' }).closest('button') as HTMLElement, 'Oak Lane');
    await waitFor(() => expect(getHouses).toHaveBeenLastCalledWith({ street_id: 's2', limit: 500 }));
    expect(screen.queryByText('17F-10', { selector: 'button span' })).not.toBeInTheDocument();
  });

  it('shows no validation error until a preview is attempted, then names the missing choice', async () => {
    render(<GenerateInvoicesDialog open onClose={vi.fn()} />);
    chooseScope('house');
    expect(screen.queryByText('Choose a house')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Preview exact request/ }));
    expect(await screen.findByText('Choose a house')).toBeInTheDocument();
    expect(screen.queryByText(/ID/)).not.toBeInTheDocument();
  });

  it('searches residents only from 2 characters, debounced, then shows name, code and house', async () => {
    render(<GenerateInvoicesDialog open onClose={vi.fn()} />);
    chooseScope('resident');
    const input = screen.getByLabelText('Search resident');

    fireEvent.change(input, { target: { value: 'a' } });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(getResidents).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'ad' } });
    fireEvent.change(input, { target: { value: 'ada' } });
    expect(getResidents).not.toHaveBeenCalled();
    await waitFor(() => expect(getResidents).toHaveBeenCalledTimes(1));
    expect(getResidents).toHaveBeenCalledWith({ search: 'ada', limit: 20 });

    expect(await screen.findByText('RES001 · 4, Palm Avenue')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ada Okoro'));
    expect(screen.getByRole('button', { name: 'Change resident' })).toBeInTheDocument();
  });

  it('shows a no-matches state and an error state for resident search', async () => {
    getResidents.mockResolvedValueOnce({ data: [], count: 0, error: null });
    render(<GenerateInvoicesDialog open onClose={vi.fn()} />);
    chooseScope('resident');
    const input = screen.getByLabelText('Search resident');

    fireEvent.change(input, { target: { value: 'zz' } });
    expect(await screen.findByText('No matches')).toBeInTheDocument();

    getResidents.mockResolvedValueOnce({ data: [], count: 0, error: 'boom' });
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(await screen.findByText('Could not search residents: boom')).toBeInTheDocument();
  });
});
