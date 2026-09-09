// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { IdentifierUnverifiedBadge } from '@/components/houses/identifier-unverified-badge';

beforeAll(() => {
  // Radix's Tooltip.Content sizes itself against the viewport.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => cleanup());

/**
 * Issue #119 QA follow-up (D1) -- the badge shipped with no test at all.
 * Removing its `if (!unverified) return null` early return makes "Needs
 * confirmation" render on every house row and every house detail page, and
 * the rest of the suite stays green -- nothing else exercises this component.
 */
describe('IdentifierUnverifiedBadge (issue #119)', () => {
  it('renders nothing when the flag is false', () => {
    const { container } = render(<IdentifierUnverifiedBadge unverified={false} />);

    expect(screen.queryByTestId('identifier-unverified-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs confirmation')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the flag is null or undefined', () => {
    const { container: nullContainer } = render(
      <IdentifierUnverifiedBadge unverified={null} />
    );
    expect(nullContainer).toBeEmptyDOMElement();
    cleanup();

    const { container: undefinedContainer } = render(
      <IdentifierUnverifiedBadge unverified={undefined} />
    );
    expect(undefinedContainer).toBeEmptyDOMElement();
  });

  it('renders the badge when the flag is true', () => {
    render(<IdentifierUnverifiedBadge unverified={true} />);

    expect(screen.getByTestId('identifier-unverified-badge')).toBeInTheDocument();
    expect(screen.getByText('Needs confirmation')).toBeInTheDocument();
  });

  it('surfaces the note as the tooltip content', async () => {
    render(
      <IdentifierUnverifiedBadge
        unverified={true}
        note="Recorded from the manual register with a doubted character."
      />
    );

    // Radix Tooltip.Content is not in the DOM until the trigger is hovered
    // or focused, so open it via focus (the keyboard-accessible path) rather
    // than asserting against tooltip internals.
    fireEvent.focus(screen.getByTestId('identifier-unverified-badge'));

    // Radix renders the tooltip text twice (the positioned content and a
    // visually-hidden `aria-describedby` copy for screen readers).
    await waitFor(() =>
      expect(
        screen.getAllByText('Recorded from the manual register with a doubted character.').length
      ).toBeGreaterThan(0)
    );
  });

  it('falls back to a default explanation when no note is recorded', async () => {
    render(<IdentifierUnverifiedBadge unverified={true} note={null} />);

    fireEvent.focus(screen.getByTestId('identifier-unverified-badge'));

    await waitFor(() =>
      expect(
        screen
          .getAllByText('This house identifier was recorded with doubt and has not been confirmed.')
          .length
      ).toBeGreaterThan(0)
    );
  });
});
