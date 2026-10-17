// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { RecordCard } from '../record-card';

afterEach(() => cleanup());

type Handler = (event: unknown, card: HTMLElement) => void;

function renderCard(onClick?: Handler) {
  const onAction = vi.fn();
  const onLeading = vi.fn();
  const props = onClick ? { onClick: onClick as never, label: 'Open Ada Obi' } : {};
  const utils = render(
    <RecordCard
      data-testid="card"
      title="Ada Obi"
      badge={<span>Active</span>}
      subtitle="R-001"
      leading={<input type="checkbox" aria-label="Select" onChange={onLeading} />}
      actions={
        <>
          <button onClick={onAction}>Do it</button>
          <a href="/somewhere">Go</a>
        </>
      }
      {...props}
    >
      <p>Body text</p>
    </RecordCard>,
  );
  return { onAction, onLeading, ...utils };
}

describe('RecordCard', () => {
  it('renders every slot', () => {
    renderCard();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('R-001')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go' })).toBeInTheDocument();
  });

  it('has no hit-area button without onClick', () => {
    const { container } = renderCard();
    expect(container.querySelector('[data-slot="record-card-hit-area"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Ada Obi' })).not.toBeInTheDocument();
  });

  it('never makes the card root a button or focusable, with or without onClick', () => {
    for (const handler of [undefined, vi.fn()]) {
      const { unmount } = renderCard(handler);
      const card = screen.getByTestId('card');
      expect(card).not.toHaveAttribute('role');
      expect(card).not.toHaveAttribute('tabindex');
      unmount();
    }
  });

  it('renders one real, named, full-bleed button as the hit area when clickable', () => {
    const { container } = renderCard(vi.fn());
    const hit = screen.getByRole('button', { name: 'Open Ada Obi' });
    expect(hit.tagName).toBe('BUTTON');
    expect(hit).toHaveAttribute('type', 'button');
    expect(hit).toHaveAttribute('data-slot', 'record-card-hit-area');
    expect(hit.className).toContain('absolute');
    expect(hit.className).toContain('inset-0');
    expect(hit.className).toContain('focus-visible:ring-');
    expect(container.querySelectorAll('[data-slot="record-card-hit-area"]')).toHaveLength(1);
    expect(screen.getByTestId('card').className).toContain('min-h-11');
    expect(screen.getByTestId('card').className).toContain('relative');
  });

  it('keeps content above the hit area and lets taps on text fall through', () => {
    renderCard(vi.fn());
    const header = screen.getByText('Ada Obi').closest('[data-slot="record-card-title"]')!.parentElement!.parentElement!;
    expect(header.className).toContain('pointer-events-none');
    expect(header.className).toContain('z-10');
    expect(header.className).toContain('[&_button]:pointer-events-auto');
    expect(header.className).toContain('[&_a]:pointer-events-auto');
    expect(header.className).toContain('[&_[role=checkbox]]:pointer-events-auto');
    const actions = screen.getByRole('button', { name: 'Do it' }).parentElement!;
    expect(actions.className).toContain('pointer-events-none');
    expect(actions.className).toContain('[&_button]:pointer-events-auto');
  });

  it('calls onClick with the event and the card root (not the button)', () => {
    const onClick = vi.fn();
    renderCard(onClick);
    fireEvent.click(screen.getByRole('button', { name: 'Open Ada Obi' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][1]).toBe(screen.getByTestId('card'));
  });

  it('does not call onClick for clicks on the action button or link', () => {
    const onClick = vi.fn();
    const { onAction } = renderCard(onClick);
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    fireEvent.click(screen.getByRole('link', { name: 'Go' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick for clicks on the leading checkbox', () => {
    const onClick = vi.fn();
    const { onLeading } = renderCard(onClick);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select' }));
    expect(onLeading).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('never nests an interactive element inside a button or link', () => {
    const { container } = renderCard(vi.fn());
    expect(container.querySelectorAll('button button, button a, a button, a a, button input, a input')).toHaveLength(0);
    expect(container.querySelectorAll('button [role=checkbox], a [role=checkbox]')).toHaveLength(0);
  });
});
