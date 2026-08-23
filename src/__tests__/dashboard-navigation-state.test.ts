import { describe, expect, it } from 'vitest';
import { getDashboardNavigationState } from '@/hooks/use-dashboard-navigation-state';

function params(values: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name) {
      return values[name] ?? null;
    },
  };
}

describe('dashboard navigation state', () => {
  it('keeps the normal path out of debug and unauthorized states', () => {
    expect(getDashboardNavigationState(params({}))).toEqual({
      debug: false,
      unauthorized: false,
    });
  });

  it('enables debug output only for the explicit debug path', () => {
    expect(getDashboardNavigationState(params({ debug: 'true' }))).toEqual({
      debug: true,
      unauthorized: false,
    });
    expect(getDashboardNavigationState(params({ debug: 'false' })).debug).toBe(false);
  });

  it('identifies an unauthorized navigation result independently of debug mode', () => {
    expect(
      getDashboardNavigationState(params({ debug: 'true', error: 'unauthorized' }))
    ).toEqual({
      debug: true,
      unauthorized: true,
    });
  });
});
