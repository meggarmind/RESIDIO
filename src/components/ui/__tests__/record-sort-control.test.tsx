// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { RecordSortControl } from '../record-sort-control';

const OPTIONS = [
  { value: 'resident_code', label: 'Code' },
  { value: 'first_name', label: 'Name' },
];

beforeAll(() => {
  // Radix Select expects these pointer/scroll APIs, which jsdom lacks.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

afterEach(() => cleanup());

describe('RecordSortControl', () => {
  it('calls onSort with the newly chosen option', () => {
    const onSort = vi.fn();
    render(<RecordSortControl options={OPTIONS} sortBy="resident_code" sortOrder="asc" onSort={onSort} />);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort by' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Name' }));
    expect(onSort).toHaveBeenCalledExactlyOnceWith('first_name');
  });

  it('calls onSort with the current column from the direction button', () => {
    const onSort = vi.fn();
    render(<RecordSortControl options={OPTIONS} sortBy="first_name" sortOrder="asc" onSort={onSort} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));
    expect(onSort).toHaveBeenCalledExactlyOnceWith('first_name');
  });

  it('labels the direction button for each order', () => {
    const { rerender } = render(
      <RecordSortControl options={OPTIONS} sortBy="first_name" sortOrder="asc" onSort={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Sort ascending' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort descending' })).not.toBeInTheDocument();
    rerender(<RecordSortControl options={OPTIONS} sortBy="first_name" sortOrder="desc" onSort={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sort descending' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort ascending' })).not.toBeInTheDocument();
  });

  it('disables the direction button when nothing is sorted and never calls onSort', () => {
    const onSort = vi.fn();
    render(<RecordSortControl options={OPTIONS} onSort={onSort} />);
    const button = screen.getByRole('button', { name: 'Sort ascending' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSort).not.toHaveBeenCalled();
  });
});
