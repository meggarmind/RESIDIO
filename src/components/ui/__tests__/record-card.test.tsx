// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { RecordCard } from '../record-card';

afterEach(() => cleanup());

function renderCard(onClick?: (e: unknown) => void) {
  const onAction = vi.fn();
  const onLeading = vi.fn();
  render(
    <RecordCard
      data-testid="card"
      title="Ada Obi"
      badge={<span>Active</span>}
      subtitle="R-001"
      leading={<input type="checkbox" aria-label="Select" onChange={onLeading} />}
      actions={<button onClick={onAction}>Do it</button>}
      onClick={onClick}
    >
      <p>Body text</p>
    </RecordCard>,
  );
  return { onAction, onLeading };
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
  });

  it('is not a button and not focusable without onClick', () => {
    renderCard();
    const card = screen.getByTestId('card');
    expect(card).not.toHaveAttribute('role');
    expect(card).not.toHaveAttribute('tabindex');
    fireEvent.keyDown(card, { key: 'Enter' });
  });

  it('is a focusable button with a focus ring and 44px minimum height when clickable', () => {
    renderCard(vi.fn());
    const card = screen.getByTestId('card');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card.className).toContain('min-h-11');
    expect(card.className).toContain('focus-visible:ring-');
  });

  it('calls onClick on click and passes the event through', () => {
    const seen: unknown[] = [];
    const onClick = vi.fn((e: { currentTarget: unknown }) => seen.push(e.currentTarget));
    renderCard(onClick as (e: unknown) => void);
    const card = screen.getByTestId('card');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([card]);
  });

  it('calls onClick on Enter and on Space', () => {
    const onClick = vi.fn();
    renderCard(onClick);
    const card = screen.getByTestId('card');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(card, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not call onClick for clicks or keys inside actions', () => {
    const onClick = vi.fn();
    const { onAction } = renderCard(onClick);
    const button = screen.getByRole('button', { name: 'Do it' });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick for clicks or keys inside leading', () => {
    const onClick = vi.fn();
    const { onLeading } = renderCard(onClick);
    const box = screen.getByRole('checkbox', { name: 'Select' });
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: ' ' });
    expect(onLeading).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
