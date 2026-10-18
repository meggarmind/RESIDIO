// @vitest-environment jsdom
// Issue #767: success mapped to chart-3 (gold) and every -subtle variant equalled its base,
// so paid states read as amber and base-coloured text vanished on its subtle background.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VisualThemeProvider } from '@/contexts/visual-theme-context';
import { getAllThemes } from '@/lib/themes/tweakcn-registry';

const mocks = vi.hoisted(() => ({ resolvedTheme: 'light' }));

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: mocks.resolvedTheme }) }));
vi.mock('@/hooks/use-theme-preferences', () => ({ useEffectiveTheme: () => ({ data: undefined }) }));
vi.mock('@/lib/fonts', () => ({ loadThemeFonts: () => Promise.resolve() }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  document.documentElement.removeAttribute('style');
});

const cases = getAllThemes().flatMap((theme) =>
  (['light', 'dark'] as const).map((mode) => ({ theme, mode }))
);

describe('status colour tokens (#767)', () => {
  it.each(cases)('$theme.id ($mode) maps success to green and tints each subtle variant', ({ theme, mode }) => {
    mocks.resolvedTheme = mode;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    render(
      <VisualThemeProvider context="admin" initialThemeId={theme.id}>
        <div />
      </VisualThemeProvider>
    );

    const colors = theme.cssVars[mode];
    const css = (name: string) => document.documentElement.style.getPropertyValue(name);

    expect(css('--success')).toBe(colors['chart-1']);
    expect(css('--status-success')).toBe(colors['chart-1']);
    expect(css('--status-success')).not.toBe(colors['chart-3']);

    const bases = {
      success: colors['chart-1'],
      warning: colors['chart-4'],
      error: colors.destructive,
      info: colors['chart-2'],
    };
    for (const [status, base] of Object.entries(bases)) {
      expect(css(`--status-${status}`)).toBe(base);
      expect(css(`--status-${status}-subtle`)).toBe(
        `color-mix(in oklch, ${base} 15%, ${colors.background})`
      );
    }
  });
});
