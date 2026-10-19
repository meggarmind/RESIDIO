// #758: shared dashboard status colours. Guards the shape of the module and
// that it never falls back to the broken `status-*` tokens or theme-blind colours.

import { describe, expect, it } from 'vitest';
import { STATUS_COLORS, type StatusState } from '@/components/dashboard/status-colors';

const STATES: StatusState[] = ['ok', 'attention', 'overdue', 'neutral'];

describe('STATUS_COLORS', () => {
  it('defines text and border for every state', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...STATES].sort());
    for (const s of STATES) {
      expect(STATUS_COLORS[s].text).toMatch(/\S/);
      expect(STATUS_COLORS[s].border).toMatch(/\S/);
    }
  });

  it('uses no status-* tokens, hex, or palette steps', () => {
    for (const s of STATES) {
      for (const cls of Object.values(STATUS_COLORS[s])) {
        expect(cls).not.toMatch(/status-/);
        expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/);
        expect(cls).not.toMatch(/-(red|green|amber|yellow|orange|emerald|gray|slate)-\d{2,3}/);
      }
    }
  });

  it('maps hues: ok green, attention amber, overdue red, neutral muted', () => {
    expect(STATUS_COLORS.ok.text).toContain('chart-1');
    expect(STATUS_COLORS.attention.text).toContain('chart-3');
    expect(STATUS_COLORS.overdue.text).toContain('destructive');
    expect(STATUS_COLORS.neutral.text).toBe('text-muted-foreground');
  });
});
