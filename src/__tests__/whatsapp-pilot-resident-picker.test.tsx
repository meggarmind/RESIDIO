// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PilotResidentPicker } from '@/app/(dashboard)/settings/whatsapp/pilot-resident-picker';

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

describe('PilotResidentPicker (#801)', () => {
  it('renders saved IDs by name, and an unmatched ID as unknown', () => {
    render(<PilotResidentPicker options={OPTIONS} value={['res-2', 'deadbeef-0000']} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remove Ada Okoro' })).toBeInTheDocument();
    expect(screen.getByText('Unknown resident (deadbeef)')).toBeInTheDocument();
  });

  it('shows the load error when the resident list failed', () => {
    render(<PilotResidentPicker options={[]} value={['deadbeef-0000']} onChange={vi.fn()} error="permission denied" />);
    expect(screen.getByText('Could not load residents: permission denied')).toBeInTheDocument();
  });

  it('removes a selected resident by ID', () => {
    const onChange = vi.fn();
    render(<PilotResidentPicker options={OPTIONS} value={['res-1', 'res-2']} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Ada Okoro' })[0]);
    expect(onChange).toHaveBeenCalledWith(['res-2']);
  });

  it('adds a resident picked from the list, telling same-name residents apart by detail', () => {
    const onChange = vi.fn();
    render(<PilotResidentPicker options={OPTIONS} value={['res-1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose pilot residents' }));
    fireEvent.click(screen.getByText('RES002 · 4 Oak Lane'));
    expect(onChange).toHaveBeenCalledWith(['res-1', 'res-2']);
  });

  it('offers no remove buttons when disabled', () => {
    render(<PilotResidentPicker options={OPTIONS} value={['res-1']} onChange={vi.fn()} disabled />);
    expect(screen.getByText('Ada Okoro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose pilot residents' })).toBeDisabled();
  });
});
