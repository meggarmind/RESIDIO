// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NumericSettingInput, parseNumericSetting } from '@/components/settings/numeric-setting-input';

// #790: numeric settings keep a local draft, validate, and commit once on blur or Enter.
// Typing never writes and an empty or out-of-range entry never falls back to a default.

afterEach(() => cleanup());

function setup(value = 7, rule = { min: 1, max: 30, integer: true }) {
  const onCommit = vi.fn();
  render(<NumericSettingInput id="grace" aria-label="Grace period" value={value} onCommit={onCommit} {...rule} unit="days" />);
  return { onCommit, input: screen.getByLabelText('Grace period') as HTMLInputElement };
}

describe('parseNumericSetting', () => {
  const rule = { min: 1, max: 90, integer: true };
  it('accepts a whole number in range', () => {
    expect(parseNumericSetting('20', rule)).toEqual({ value: 20 });
    expect(parseNumericSetting('1,000', { min: 1, max: 5000 })).toEqual({ value: 1000 });
  });
  it.each(['', '  ', '0', '91', '2.5', 'abc', '12abc'])('rejects %j with a plain message', (draft) => {
    expect(parseNumericSetting(draft, rule)).toEqual({ error: 'Enter a whole number from 1 to 90.' });
  });
  it('allows decimals when the rule does', () => {
    expect(parseNumericSetting('2.5', { min: 0.1, max: 100 })).toEqual({ value: 2.5 });
  });
});

describe('NumericSettingInput', () => {
  it('never writes while typing; typing "20" commits once on blur', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '20' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(20);
  });

  it('commits on Enter', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(12);
  });

  it('clearing the field never writes and says why', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number from 1 to 30.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects 0 and out-of-range values without writing', () => {
    const { onCommit, input } = setup();
    for (const value of ['0', '31']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    }
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not write an unchanged value', () => {
    const { onCommit, input } = setup(7);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('stays editable so focus is not lost mid-typing', () => {
    const { input } = setup();
    expect(input).not.toBeDisabled();
    expect(screen.getByText('days')).toBeInTheDocument();
  });

  it('reports validity to a page with its own Save button', () => {
    const onValidityChange = vi.fn();
    render(<NumericSettingInput aria-label="Timeout" value={60} min={5} max={1440} integer onCommit={vi.fn()} onValidityChange={onValidityChange} />);
    const input = screen.getByLabelText('Timeout');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.blur(input);
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.blur(input);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });
});
