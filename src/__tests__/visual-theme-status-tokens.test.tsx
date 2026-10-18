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

type Oklch = [number, number, number];

// Evaluates the oklch() and color-mix(in oklch, ...) forms the provider writes, gamut-clipped to sRGB
function evalColor(value: string): Oklch {
  const lit = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (lit) return [+lit[1], +lit[2], +lit[3]];
  if (value === 'black') return [0, 0, NaN];
  if (value === 'white') return [1, 0, NaN];
  const m = value.match(/^color-mix\(in oklch, (oklch\([^)]*\)|\w+)(?: (\d+)%)?, (oklch\([^)]*\)|\w+)(?: (\d+)%)?\)$/);
  if (!m) throw new Error(`unparsed colour: ${value}`);
  const a = evalColor(m[1]);
  const b = evalColor(m[3]);
  const wa = m[2] ? +m[2] / 100 : m[4] ? 1 - +m[4] / 100 : 0.5;
  // An achromatic end has a missing hue and takes the other's (CSS Color 4)
  const ha = Number.isNaN(a[2]) ? b[2] : a[2];
  const hb = Number.isNaN(b[2]) ? a[2] : b[2];
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [a[0] * wa + b[0] * (1 - wa), a[1] * wa + b[1] * (1 - wa), ha + dh * (1 - wa)];
}

function luminance([L, C, H]: Oklch): number {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  const r = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(x: string, y: string): number {
  const [hi, lo] = [luminance(evalColor(x)), luminance(evalColor(y))].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const cases = getAllThemes().flatMap((theme) =>
  (['light', 'dark'] as const).map((mode) => ({ theme, mode }))
);

describe('status colour tokens (#767)', () => {
  it.each(cases)('$theme.id ($mode) maps success to green and tints each subtle variant', ({ theme, mode }) => {
    mocks.resolvedTheme = mode;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    render(
      <VisualThemeProvider context="admin-dashboard" initialThemeId={theme.id}>
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

  it.each(cases)('$theme.id ($mode) status text clears 4.5:1 on its subtle tint', ({ theme, mode }) => {
    mocks.resolvedTheme = mode;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    render(
      <VisualThemeProvider context="admin-dashboard" initialThemeId={theme.id}>
        <div />
      </VisualThemeProvider>
    );

    const css = (name: string) => document.documentElement.style.getPropertyValue(name);
    for (const status of ['success', 'warning', 'error', 'info']) {
      const ratio = contrast(css(`--status-${status}-text`), css(`--status-${status}-subtle`));
      expect(ratio, `${status} text on its subtle tint`).toBeGreaterThanOrEqual(4.5);
    }
    if (mode === 'dark') {
      for (const status of ['success', 'warning', 'info']) {
        expect(css(`--status-${status}-text`)).toBe(css(`--status-${status}`));
      }
    }
  });
});
