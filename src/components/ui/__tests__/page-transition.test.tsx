// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const captured = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));

vi.mock('next/navigation', () => ({ usePathname: () => '/residents/1' }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
      captured.props = props;
      return <div>{children}</div>;
    },
  },
}));

import { PageTransition } from '../page-transition';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.sharedTransition;
  captured.props = null;
});

describe('PageTransition', () => {
  it('keeps the generic enter animation by default', () => {
    render(<PageTransition>x</PageTransition>);
    expect(captured.props?.initial).toBe('hidden');
  });

  it('skips the enter animation (initial={false}) only during a shared-element transition', () => {
    document.documentElement.dataset.sharedTransition = 'true';
    render(<PageTransition>x</PageTransition>);
    expect(captured.props?.initial).toBe(false);
  });
});
