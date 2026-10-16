// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditCard } from 'lucide-react';
import { EnhancedStatCard, statValueFontSize } from '@/components/dashboard/enhanced-stat-card';

vi.mock('@/contexts/visual-theme-context', () => ({
  useVisualTheme: () => ({ themeId: 'default' }),
}));

// jsdom cannot evaluate container-query units (it drops the inline font-size),
// so the formula is tested directly and the markup it relies on separately (#669).
describe('EnhancedStatCard value sizing', () => {
  it('shrinks long values in proportion to their length, capped at text-3xl', () => {
    expect(statValueFontSize('₦1,234,567,890.00')).toBe('min(1.875rem, calc(100cqi / 11.05))');
    expect(statValueFontSize(42)).toBe('min(1.875rem, calc(100cqi / 1.3))');
  });

  it('does not divide by zero for an empty value', () => {
    expect(statValueFontSize('')).toBe('min(1.875rem, calc(100cqi / 0.65))');
  });

  it('renders the value unwrapped inside a size container', () => {
    render(<EnhancedStatCard title="Total Collected" value="₦1,234,567,890.00" icon={CreditCard} />);

    const value = screen.getByText('₦1,234,567,890.00');
    expect(value.classList.contains('whitespace-nowrap')).toBe(true);
    expect(value.classList.contains('tabular-nums')).toBe(true);
    expect(value.parentElement?.classList.contains('@container')).toBe(true);
  });
});
