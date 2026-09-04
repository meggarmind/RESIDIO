// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
// Registers `toBeInTheDocument()` etc. with vitest's `expect` -- there is no
// global setupFile for this in vitest.config.ts (this is the first test in
// the repo that renders anything), so it is imported directly here.
import '@testing-library/jest-dom/vitest';

afterEach(() => cleanup());

/**
 * Renders the actual command palette and types into it -- the test QA's
 * adversarial pass (F1) says would have caught the real defect: local
 * matching (`matchSettingsEntries`) was correct in isolation, but cmdk's own
 * built-in filter (on by default, scored against each `CommandItem`'s
 * `value`) was re-filtering -- and hiding -- rows the local matcher already
 * returned, because `searchText` was never given to cmdk. `shouldFilter=
 * {false}` on `CommandDialog` (see `src/components/ui/command.tsx`) is the
 * fix; this test exercises the real render path so a regression there (or
 * in `value={item.href}` on the result `CommandItem`) fails a test instead
 * of only failing in the running app.
 *
 * This is the first test in the repo that renders a React component
 * (`jsdom` + `@testing-library/react` were added as devDependencies
 * specifically for it -- neither existed in this project before).
 * `next/navigation`, `@tanstack/react-query` and the auth context are
 * mocked below to keep this a unit test of the palette's own rendering and
 * filtering, not an integration test of routing/auth/the search API.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    hasAllPermissions: () => true,
    hasAnyPermission: () => true,
    isLoading: false,
  }),
}));

// The API results path (`/api/search`) is irrelevant to what this test
// checks (Settings/System entries are local, not API-backed) -- mocked away
// so the test isn't coupled to fetch/QueryClient setup or network timing.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
}));

// cmdk calls `scrollIntoView` when the highlighted item changes, and
// observes list size with `ResizeObserver`; jsdom implements neither.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

async function renderPalette() {
  const { GlobalSearchCommand } = await import('../global-search-command');
  render(<GlobalSearchCommand open={true} onOpenChange={() => {}} />);
}

// This file is the only `jsdom`-environment test in a suite that is
// otherwise entirely `node`-environment (see `vitest.config.ts`); the jsdom
// bootstrap plus a dynamic `import()` is measured at ~1.6s standalone but
// can exceed the default 5000ms test timeout under full-suite parallel
// worker contention. Given an explicit timeout so it doesn't join
// `whatsapp/webhook/twilio/route.test.ts` and `module-integration.test.ts`
// as a third "passes alone, times out under load" file.
const RENDER_TEST_TIMEOUT = 15000;

describe('GlobalSearchCommand (rendered)', () => {
  it('finds and shows the Gmail Import row for the query "email import" -- issue #179\'s acceptance criterion', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText('Search or type a command...');
    fireEvent.change(input, { target: { value: 'email import' } });

    // If cmdk's own filter were still active (F1), it would score this row
    // 0 against "email import" and hide it even though the local matcher
    // returned it -- this assertion is exactly what would have failed
    // before `shouldFilter={false}` was wired through.
    await waitFor(() => {
      expect(screen.getByText('Gmail Import')).toBeInTheDocument();
    });
  }, RENDER_TEST_TIMEOUT);

  it('does not render a blank box: local results and visible results agree (F2)', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText('Search or type a command...');
    fireEvent.change(input, { target: { value: 'email import' } });

    await waitFor(() => {
      // Exactly the rows the local matcher returns are on screen -- not
      // fewer (cmdk re-hiding some) and not an empty-results message either.
      expect(screen.getByText('Gmail Import')).toBeInTheDocument();
      expect(screen.queryByText(/No results found/i)).not.toBeInTheDocument();
    });
  }, RENDER_TEST_TIMEOUT);

  it('does not show Settings/System rows for a single-character query (F3)', async () => {
    await renderPalette();

    const input = screen.getByPlaceholderText('Search or type a command...');
    fireEvent.change(input, { target: { value: 'e' } });

    // "e" alone matches ~all 37 Settings/System entries by `searchText`
    // token-substring rules; the palette must not dump them for one
    // keystroke. Gmail Import's row is a stand-in for "any Settings/System
    // result rendered".
    await waitFor(() => {
      expect(screen.queryByText('Gmail Import')).not.toBeInTheDocument();
    });
  }, RENDER_TEST_TIMEOUT);
});
