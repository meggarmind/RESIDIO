/**
 * Storage behaviour for the main sidebar's expand/collapse state.
 *
 * The React binding (`useSidebarNavState`) is not covered here — the project
 * has no DOM test environment — but the logic worth protecting is all in the
 * store: that a reader's choice survives the remount `app/template.tsx`
 * forces on every navigation, that a hostile or corrupt blob cannot poison
 * the sidebar, and that unavailable storage degrades to "no overrides"
 * rather than throwing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const STORAGE_KEY = 'residio-sidebar-nav-open-menus';

/** Minimal sessionStorage stand-in; the node test environment has none. */
function installStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    const storage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    };
    vi.stubGlobal('sessionStorage', storage);
    return store;
}

/** Fresh module per test, since the snapshot is cached at module scope. */
async function loadModule() {
    vi.resetModules();
    return import('./use-sidebar-nav-state');
}

beforeEach(() => {
    installStorage();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('sidebar nav state store', () => {
    it('starts with no overrides, so the sidebar falls back to the active menu', async () => {
        const { getSnapshot } = await loadModule();
        expect(getSnapshot()).toEqual({});
    });

    it('records a menu the reader opened, and persists it', async () => {
        const store = installStorage();
        const { getSnapshot, setMenuOpen } = await loadModule();

        setMenuOpen('transactions', true);

        expect(getSnapshot()).toEqual({ transactions: true });
        expect(JSON.parse(store.get(STORAGE_KEY)!)).toEqual({ transactions: true });
    });

    it('records a collapse distinctly from never having been touched', async () => {
        const { getSnapshot, setMenuOpen } = await loadModule();

        setMenuOpen('invoices-dues', false);

        // `false` must be present, not absent: absent means "fall back to the
        // active menu", which would spring the menu the reader just closed
        // straight back open.
        expect(getSnapshot()).toHaveProperty('invoices-dues', false);
    });

    it('leaves an untouched menu absent, so `userToggled[id] ?? isActive` falls through', async () => {
        const { getSnapshot, setMenuOpen } = await loadModule();

        setMenuOpen('transactions', true);

        // "reports" was never toggled by the reader — it must be `undefined`,
        // not `false`, so the sidebar's `userToggled[id] ?? isActive` overlay
        // still auto-expands it while the reader is inside it.
        expect(getSnapshot().reports).toBeUndefined();
        expect('reports' in getSnapshot()).toBe(false);
    });

    it('restores a previous session from storage', async () => {
        installStorage({ [STORAGE_KEY]: JSON.stringify({ reports: true }) });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toEqual({ reports: true });
    });

    it('returns a stable snapshot identity, so useSyncExternalStore cannot loop', async () => {
        installStorage({ [STORAGE_KEY]: JSON.stringify({ transactions: true }) });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toBe(getSnapshot());
    });

    it('changes snapshot identity on write, so subscribers re-render', async () => {
        const { getSnapshot, setMenuOpen } = await loadModule();
        const before = getSnapshot();

        setMenuOpen('invoices-dues', true);

        expect(getSnapshot()).not.toBe(before);
    });

    it('ignores corrupt JSON rather than throwing', async () => {
        installStorage({ [STORAGE_KEY]: '{not json' });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toEqual({});
    });

    it('drops non-boolean values instead of trusting the stored blob', async () => {
        installStorage({
            [STORAGE_KEY]: JSON.stringify({
                transactions: true,
                Injected: { nested: 'object' },
                Sneaky: 'true',
            }),
        });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toEqual({ transactions: true });
    });

    it('ignores a stored array', async () => {
        installStorage({ [STORAGE_KEY]: JSON.stringify(['transactions']) });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toEqual({});
    });

    it('degrades to no overrides when storage is unavailable', async () => {
        vi.stubGlobal('sessionStorage', {
            getItem: () => {
                throw new Error('SecurityError: storage is disabled');
            },
            setItem: () => {
                throw new Error('SecurityError: storage is disabled');
            },
            removeItem: () => {},
        });
        const { getSnapshot, setMenuOpen } = await loadModule();

        expect(getSnapshot()).toEqual({});
        // The write still applies in memory so the current page behaves.
        expect(() => setMenuOpen('transactions', true)).not.toThrow();
        expect(getSnapshot()).toEqual({ transactions: true });
    });

    it('survives the remount that app/template.tsx forces on every navigation', async () => {
        // The bug this store exists to fix: a submenu opened but NOT navigated
        // into is torn down and rebuilt on the very next page change, so the
        // choice has to be readable by a brand new instance. Simulated by
        // writing, then loading the module fresh against the same backing
        // store — exactly what happens when `Sidebar` remounts.
        const store = installStorage();
        const first = await loadModule();
        first.setMenuOpen('transactions', true);

        vi.stubGlobal('sessionStorage', {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
        const remounted = await loadModule();

        expect(remounted.getSnapshot()).toEqual({ transactions: true });
    });
});
