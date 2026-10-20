// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ResidentPicker } from '@/components/residents/resident-picker';

const OPTIONS = [
  { id: 'res-1', name: 'Ada Okoro', detail: 'RES001 · 12 Palm Close' },
  { id: 'res-2', name: 'Ada Okoro', detail: 'RES002 · 4 Oak Lane' },
];

beforeAll(() => {
  // cmdk and Radix probe browser APIs jsdom does not implement.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});
afterEach(() => cleanup());

describe('ResidentPicker (#801, #819)', () => {
  it('renders saved IDs by name, and an unmatched ID as unknown', () => {
    render(<ResidentPicker triggerLabel="Choose pilot residents" options={OPTIONS} value={['res-2', 'deadbeef-0000']} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remove Ada Okoro' })).toBeInTheDocument();
    expect(screen.getByText('Unknown resident (deadbeef)')).toBeInTheDocument();
  });

  it('shows the load error when the resident list failed', () => {
    render(<ResidentPicker options={[]} value={['deadbeef-0000']} onChange={vi.fn()} error="permission denied" />);
    expect(screen.getByText('Could not load residents: permission denied')).toBeInTheDocument();
  });

  it('removes a selected resident by ID', () => {
    const onChange = vi.fn();
    render(<ResidentPicker triggerLabel="Choose pilot residents" options={OPTIONS} value={['res-1', 'res-2']} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Ada Okoro' })[0]);
    expect(onChange).toHaveBeenCalledWith(['res-2']);
  });

  it('adds a resident picked from the list, telling same-name residents apart by detail', () => {
    const onChange = vi.fn();
    render(<ResidentPicker triggerLabel="Choose pilot residents" options={OPTIONS} value={['res-1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose pilot residents' }));
    fireEvent.click(screen.getByText('RES002 · 4 Oak Lane'));
    expect(onChange).toHaveBeenCalledWith(['res-1', 'res-2']);
  });

  it('offers no remove buttons when disabled', () => {
    render(<ResidentPicker triggerLabel="Choose pilot residents" options={OPTIONS} value={['res-1']} onChange={vi.fn()} disabled />);
    expect(screen.getByText('Ada Okoro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose pilot residents' })).toBeDisabled();
  });

  it('marks a member who cannot receive with the reason on the badge', () => {
    render(<ResidentPicker options={OPTIONS} value={['res-1', 'res-2']} onChange={vi.fn()} warnings={{ 'res-1': 'not opted in' }} />);
    expect(screen.getByText('Ada Okoro: not opted in')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Okoro')).toHaveLength(1);
  });
});
