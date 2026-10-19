// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StickySaveBar } from '@/components/settings/sticky-save-bar';

/**
 * #790: the save bar shares z-50 with the root-layout assistant pill, which renders after the
 * page content. At equal z the later element paints on top, so the bar must sit after the pill
 * in <body> or the pill covers "Save changes".
 */
describe('StickySaveBar', () => {
  afterEach(cleanup);

  it('renders after a fixed root-layout sibling so it paints over it, and Save still fires', () => {
    const onSave = vi.fn();
    render(
      <>
        <StickySaveBar isDirty isSaving={false} onSave={onSave} onDiscard={() => {}} />
        <div data-testid="assistant-pill" className="fixed bottom-6 right-6 z-50" />
      </>,
    );

    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    const pill = screen.getByTestId('assistant-pill');
    expect(bar.parentElement).toBe(document.body);
    expect(pill.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('renders nothing without unsaved changes', () => {
    render(<StickySaveBar isDirty={false} isSaving={false} onSave={() => {}} onDiscard={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });
});
