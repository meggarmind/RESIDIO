// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { DataTable, type DataTableColumn, type DataTableProps } from '@/components/ui/data-table';

type Row = { id: string; code: string; name: string };

const ROWS: Row[] = [
  { id: 'a', code: 'R-001', name: 'Ada' },
  { id: 'b', code: 'R-002', name: 'Bayo' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'code', header: 'Code', sortable: true, identifier: true, cell: (r) => r.code },
  { key: 'name', header: 'Name', sortable: true, cell: (r) => r.name },
  { key: 'extra', header: 'Extra', hideBelow: 'xl', cell: () => 'x' },
];

function setup(overrides: Partial<DataTableProps<Row>> = {}) {
  const props = {
    onSortChange: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onRowClick: vi.fn(),
    onSelectedKeysChange: vi.fn(),
  };
  render(
    <DataTable<Row>
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      emptyState={<p>Nothing here</p>}
      sort={{ key: 'code', order: 'asc' }}
      onSortChange={props.onSortChange}
      pagination={{ page: 3, pageSize: 10, totalCount: 45, onPageChange: props.onPageChange, onPageSizeChange: props.onPageSizeChange }}
      onRowClick={props.onRowClick}
      actions={(r) => <button>act {r.id}</button>}
      renderCard={(r) => <div data-testid="card">{r.name}</div>}
      cardListTestId="cards"
      itemLabel="people"
      {...overrides}
    />,
  );
  return props;
}

afterEach(() => cleanup());

describe('DataTable sorting', () => {
  it('flips the current column and resets to page 1', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(p.onSortChange).toHaveBeenCalledWith({ key: 'code', order: 'desc' });
    expect(p.onPageChange).toHaveBeenCalledWith(1);
  });

  it('sorts a new column ascending', () => {
    const p = setup({ sort: { key: 'code', order: 'desc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(p.onSortChange).toHaveBeenCalledWith({ key: 'name', order: 'asc' });
  });

  it('sets aria-sort on sortable headers only', () => {
    setup({ sort: { key: 'name', order: 'desc' } });
    expect(screen.getByRole('columnheader', { name: 'Code' })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Extra' })).not.toHaveAttribute('aria-sort');
  });
});

describe('DataTable rows', () => {
  it('opens the row on click but not from the Actions column', () => {
    const p = setup();
    const table = within(screen.getByRole('table'));
    fireEvent.click(table.getByText('Bayo'));
    expect(p.onRowClick).toHaveBeenCalledTimes(1);
    expect(p.onRowClick.mock.calls[0][0]).toEqual(ROWS[1]);
    fireEvent.click(table.getByRole('button', { name: 'act a' }));
    expect(p.onRowClick).toHaveBeenCalledTimes(1);
  });

  it('pins only the identifier column and hides columns below their breakpoint', () => {
    setup();
    expect(screen.getByRole('columnheader', { name: 'Code' })).toHaveClass('sticky', 'left-0');
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveClass('sticky');
    expect(screen.getByRole('columnheader', { name: 'Extra' })).toHaveClass('hidden', 'xl:table-cell');
    const headers = screen.getAllByRole('columnheader');
    expect(headers[headers.length - 1]).toHaveTextContent('Actions');
  });

  it('shows the empty state in the table and the card list', () => {
    setup({ rows: [] });
    expect(screen.getAllByText('Nothing here')).toHaveLength(2);
  });

  it('shows 5 skeleton rows in the table and 5 skeleton cards', () => {
    setup({ isLoading: true, rows: undefined });
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByTestId('cards').querySelectorAll('[data-slot="record-card-skeleton"]')).toHaveLength(5);
  });

  it('replaces the table with the error message', () => {
    setup({ error: new Error('boom') });
    expect(screen.getByRole('alert')).toHaveTextContent('Error loading people: boom');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('DataTable phone cards', () => {
  it('renders one card per row in a list that is hidden from md up', () => {
    setup();
    const list = screen.getByTestId('cards');
    expect(list).toHaveClass('md:hidden');
    expect(within(list).getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByRole('table').closest('div.hidden')).toHaveClass('md:block');
  });

  it('offers the sortable columns as phone sort choices and resets the page', () => {
    const p = setup({ sort: undefined });
    // The direction button stays disabled until a column is chosen
    expect(within(screen.getByTestId('cards')).getByRole('button', { name: 'Sort ascending' })).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('cards')).getByRole('combobox', { name: 'Sort by' }));
    expect(screen.getByRole('option', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Extra' })).not.toBeInTheDocument();
    expect(p.onSortChange).not.toHaveBeenCalled();
  });
});

describe('DataTable pagination', () => {
  it('reports the range and moves between pages', () => {
    const p = setup();
    expect(screen.getByText('Showing 21 to 30 of 45 people')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(p.onPageChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(p.onPageChange).toHaveBeenLastCalledWith(2);
  });

  it('disables previous on page 1 and next on the last page', () => {
    cleanup();
    setup({ pagination: { page: 1, pageSize: 10, totalCount: 10, onPageChange: vi.fn(), onPageSizeChange: vi.fn() } });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('hides the footer when there are no records', () => {
    setup({ rows: [], pagination: { page: 1, pageSize: 10, totalCount: 0, onPageChange: vi.fn(), onPageSizeChange: vi.fn() } });
    expect(screen.queryByText(/Rows per page/)).not.toBeInTheDocument();
  });
});

describe('DataTable selection', () => {
  it('selects a row and the whole page without opening the row', () => {
    const onSelectedKeysChange = vi.fn();
    const p = setup({ selection: { selectedKeys: ['zzz'], onSelectedKeysChange } });
    fireEvent.click(within(screen.getByRole('table')).getAllByRole('checkbox', { name: 'Select row' })[0]);
    expect(onSelectedKeysChange).toHaveBeenLastCalledWith(['zzz', 'a']);
    expect(p.onRowClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    expect(onSelectedKeysChange).toHaveBeenLastCalledWith(['zzz', 'a', 'b']);
  });
});
