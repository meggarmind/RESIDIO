// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfirmAction } from '@/components/ui/confirm-action';

// #790: the shared confirmation. The action runs only from the confirm button, after the
// preview has loaded and any typed word matches; cancel runs nothing.

afterEach(() => cleanup());

function setup(props: Partial<React.ComponentProps<typeof ConfirmAction<{ count: number }>>> = {}) {
  const onConfirm = vi.fn();
  render(
    <ConfirmAction<{ count: number }>
      trigger={<button>Do it</button>}
      title="Really do it?"
      confirmLabel="Yes, do it"
      onConfirm={onConfirm}
      {...props}
    />
  );
  return { onConfirm };
}

const confirmButton = () => screen.getByRole('button', { name: 'Yes, do it' });

describe('ConfirmAction', () => {
  it('opens a dialog on click and runs nothing until confirmed', async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Really do it?');
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('cancel runs nothing', async () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the dry-run preview and holds confirm until it loads', async () => {
    let resolve!: (r: { data: { count: number }; error: null }) => void;
    const loadPreview = vi.fn(() => new Promise<{ data: { count: number }; error: null }>((r) => { resolve = r; }));
    setup({ loadPreview, renderPreview: (p) => <p>{p.count} invoices will be charged</p> });
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    await screen.findByRole('alertdialog');
    expect(loadPreview).toHaveBeenCalledTimes(1);
    expect(confirmButton()).toBeDisabled();
    resolve({ data: { count: 12 }, error: null });
    expect(await screen.findByText('12 invoices will be charged')).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it('blocks the action when the preview fails', async () => {
    const { onConfirm } = setup({
      loadPreview: async () => ({ data: null, error: 'Unauthorized' }),
      renderPreview: () => null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(await screen.findByText(/Could not load the preview: Unauthorized/)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('requires the typed word when one is set', async () => {
    const { onConfirm } = setup({ confirmWord: 'PRUNE' });
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    const word = await screen.findByLabelText('Type PRUNE to confirm');
    expect(confirmButton()).toBeDisabled();
    fireEvent.change(word, { target: { value: 'prune' } });
    expect(confirmButton()).toBeDisabled();
    fireEvent.change(word, { target: { value: 'PRUNE' } });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('stays open when the action fails', async () => {
    setup({ onConfirm: () => Promise.reject(new Error('nope')) });
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
