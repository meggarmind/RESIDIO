// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ALL_VALUE, ListFilterBar, type ListFilter } from '@/components/ui/list-filter-bar';

const statusOptions = [
  { value: ALL_VALUE, label: 'All Status' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

function setup(overrides: { search?: string; status?: string; type?: string } = {}) {
  const onSearch = vi.fn();
  const onStatus = vi.fn();
  const onType = vi.fn();
  const onClearAll = vi.fn();
  const onAnyChange = vi.fn();
  const filters: ListFilter[] = [
    { id: 'status', label: 'Status', value: overrides.status ?? ALL_VALUE, options: statusOptions, onChange: onStatus },
    {
      id: 'type', label: 'Type', value: overrides.type ?? ALL_VALUE, onChange: onType,
      options: [{ value: ALL_VALUE, label: 'All Types' }, { value: 'LEVY', label: 'Levy' }],
    },
  ];
  render(
    <ListFilterBar
      search={{ value: overrides.search ?? '', onChange: onSearch, placeholder: 'Invoice number...' }}
      filters={filters}
      onClearAll={onClearAll}
      onAnyChange={onAnyChange}
    />
  );
  return { onSearch, onStatus, onType, onClearAll, onAnyChange };
}

afterEach(cleanup);

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

describe('ListFilterBar', () => {
  it('shows no chips and no Clear all when nothing is active', () => {
    setup();
    expect(screen.queryByTestId('active-filters')).not.toBeInTheDocument();
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filters-count')).not.toBeInTheDocument();
  });

  it('renders a chip per active filter and a count on the Filters button', () => {
    setup({ search: 'INV-1', status: 'paid', type: 'LEVY' });
    const chips = within(screen.getByTestId('active-filters'));
    expect(chips.getByText('Search: INV-1')).toBeInTheDocument();
    expect(chips.getByText('Status: Paid')).toBeInTheDocument();
    expect(chips.getByText('Type: Levy')).toBeInTheDocument();
    expect(screen.getByTestId('filters-count')).toHaveTextContent('2');
  });

  it('removing a chip resets that filter to ALL_VALUE and calls onAnyChange', () => {
    const { onStatus, onSearch, onAnyChange } = setup({ search: 'INV-1', status: 'paid' });
    fireEvent.click(screen.getByLabelText('Remove Status filter'));
    expect(onStatus).toHaveBeenCalledWith(ALL_VALUE);
    fireEvent.click(screen.getByLabelText('Remove Search filter'));
    expect(onSearch).toHaveBeenCalledWith('');
    expect(onAnyChange).toHaveBeenCalledTimes(2);
  });

  it('Clear all runs onClearAll once and calls onAnyChange', () => {
    const { onClearAll, onAnyChange } = setup({ status: 'void' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onAnyChange).toHaveBeenCalledTimes(1);
  });

  it('typing in search calls onChange and onAnyChange', () => {
    const { onSearch, onAnyChange } = setup();
    fireEvent.change(screen.getByLabelText('Invoice number'), { target: { value: 'x' } });
    expect(onSearch).toHaveBeenCalledWith('x');
    expect(onAnyChange).toHaveBeenCalledTimes(1);
  });

  it('opens the Filters sheet from the Filters button', () => {
    setup();
    expect(screen.queryByText('Narrow the list.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByText('Narrow the list.')).toBeInTheDocument();
  });
});
