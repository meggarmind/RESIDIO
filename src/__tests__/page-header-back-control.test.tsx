// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Home } from 'lucide-react';

import { EnhancedPageHeader } from '@/components/dashboard/page-header';
import { EnhancedPageHeader as ReExported } from '@/components/dashboard/enhanced-stat-card';

describe('EnhancedPageHeader back control (#1149)', () => {
  afterEach(cleanup);

  it('renders a link named by backLabel that points at backHref', () => {
    render(<EnhancedPageHeader title="T" backHref="/houses" backLabel="Back to houses" icon={Home} />);
    const back = screen.getByRole('link', { name: 'Back to houses' });
    expect(back.getAttribute('href')).toBe('/houses');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('T');
  });

  it('falls back to "Go back" when backLabel is omitted', () => {
    render(<EnhancedPageHeader title="T" backHref="/x" />);
    expect(screen.getByRole('link', { name: 'Go back' }).getAttribute('href')).toBe('/x');
  });

  it('renders no back control without backHref', () => {
    render(<EnhancedPageHeader title="T" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is still exported from enhanced-stat-card', () => {
    expect(ReExported).toBe(EnhancedPageHeader);
  });
});
