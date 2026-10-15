// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const pathnameMock = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.value,
}));

import { AdminBreadcrumb } from '@/components/dashboard/admin-breadcrumb';

const UUID = '3f2b8c1e-5d4a-4e7b-9c1d-0a1b2c3d4e5f';

function lastCrumb() {
  return screen.getByText((_, el) => el?.getAttribute('aria-current') === 'page');
}

describe('AdminBreadcrumb UUID segments (#647)', () => {
  afterEach(cleanup);
  beforeEach(() => {
    pathnameMock.value = '/';
  });

  it('labels an import detail page "Import Details", not "Details Details"', () => {
    pathnameMock.value = `/payments/import/${UUID}`;
    render(<AdminBreadcrumb />);
    expect(lastCrumb().textContent).toBe('Import Details');
    expect(screen.queryByText(/Details Details/)).toBeNull();
  });

  it('falls back to a single "Details" when the parent segment has no mapping', () => {
    pathnameMock.value = `/something-else/${UUID}`;
    render(<AdminBreadcrumb />);
    expect(lastCrumb().textContent).toBe('Details');
  });

  it('keeps the contextual label for mapped parents', () => {
    pathnameMock.value = `/residents/${UUID}`;
    render(<AdminBreadcrumb />);
    expect(lastCrumb().textContent).toBe('Resident Details');
  });
});
