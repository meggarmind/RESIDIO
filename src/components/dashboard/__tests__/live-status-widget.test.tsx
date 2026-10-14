// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LiveStatusWidget } from '@/components/dashboard/live-status-widget';

afterEach(() => cleanup());

describe('LiveStatusWidget accessibility (#90)', () => {
  it('is a focusable button that activates on Enter and Space when onClick is set', () => {
    const onClick = vi.fn();
    render(<LiveStatusWidget title="T" status="S" onClick={onClick} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('tabindex', '0');
    expect(btn.className).toContain('focus-visible:ring-2');
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    fireEvent.keyDown(btn, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('exposes no button semantics or focus stop when not clickable', () => {
    const { container } = render(<LiveStatusWidget title="T" status="S" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('tabindex');
    expect(root.className).not.toContain('focus-visible');
    expect(root.className).not.toContain('cursor-pointer');
  });

  it('stops the ping animation under reduced motion', () => {
    const { container } = render(<LiveStatusWidget title="T" status="S" />);
    expect(container.querySelector('.animate-ping')?.className).toContain('motion-reduce:animate-none');
  });
});
