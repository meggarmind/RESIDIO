import { describe, expect, it } from 'vitest';
import { spaceOut } from '@/lib/whatsapp/assistant-format';

describe('spaceOut', () => {
  it('spaces the notices reply: heading, items with detail lines, Reply line, footer', () => {
    const input = [
      '*Notices*',
      '1. Water outage',
      '12 Oct 2026, Estate office',
      '2. Gate repair',
      '15 Oct 2026, Estate office',
      'Reply 1–2 to read a notice.',
      'Reply 0 for menu.',
    ].join('\n');
    expect(spaceOut(input)).toBe([
      '*Notices*',
      '',
      '1. Water outage',
      '12 Oct 2026, Estate office',
      '',
      '2. Gate repair',
      '15 Oct 2026, Estate office',
      '',
      'Reply 1–2 to read a notice.',
      '',
      'Reply 0 for menu.',
    ].join('\n'));
  });

  it('puts one blank before the first menu item and none between items', () => {
    expect(spaceOut('Hi A, what would you like to do?\n1. x\n2. y')).toBe(
      'Hi A, what would you like to do?\n\n1. x\n2. y',
    );
  });

  it('separates the PIN error from the estate office contact line', () => {
    expect(spaceOut("That PIN isn't correct.\nContact the estate office on 0800 000 000.")).toBe(
      "That PIN isn't correct.\n\nContact the estate office on 0800 000 000.",
    );
  });

  it('is idempotent', () => {
    const input = '*Notices*\n1. a\ndetail\n2. b\nReply 1–2 to read.\nReply 0 for menu.\n';
    const once = spaceOut(input);
    expect(spaceOut(once)).toBe(once);
  });

  it('never doubles blank lines that are already there', () => {
    expect(spaceOut('*Menu*\n\n1. x\n\nReply 0 for menu.')).toBe('*Menu*\n\n1. x\n\nReply 0 for menu.');
    expect(spaceOut('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('removes trailing blank lines', () => {
    expect(spaceOut('Hello\n\n\n')).toBe('Hello');
  });
});
