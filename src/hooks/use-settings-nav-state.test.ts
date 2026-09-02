/**
 * Storage behaviour for the settings sidebar's expand/collapse state.
 *
 * The React binding (`useSettingsNavState`) is not covered here — the project
 * has no DOM test environment — but the logic worth protecting is all in the
 * store: that a reader's choice survives, that a hostile or corrupt blob
 * cannot poison the sidebar, and that unavailable storage degrades to "no
 * overrides" rather than throwing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const STORAGE_KEY = 'residio-settings-nav-open-groups';

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
    return import('./use-settings-nav-state');
}

beforeEach(() => {
    installStorage();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('settings nav state store', () => {
    it('starts with no overrides, so the sidebar falls back to the active group', async () => {
        const { getSnapshot } = await loadModule();
        expect(getSnapshot()).toEqual({});
    });

    it('records a group the reader opened, and persists it', async () => {
        const store = installStorage();
        const { getSnapshot, setGroupOpen } = await loadModule();

        setGroupOpen('Estate Configuration', true);

        expect(getSnapshot()).toEqual({ 'Estate Configuration': true });
        expect(JSON.parse(store.get(STORAGE_KEY)!)).toEqual({ 'Estate Configuration': true });
    });

    it('records a collapse distinctly from never having been touched', async () => {
        const { getSnapshot, setGroupOpen } = await loadModule();

        setGroupOpen('General & Preferences', false);

        // `false` must be present, not absent: absent means "fall back to the
        // active group", which would spring the group the reader just closed
        // straight back open.
        expect(getSnapshot()).toHaveProperty('General & Preferences', false);
    });

    it('restores a previous session from storage', async () => {
        installStorage({ [STORAGE_KEY]: JSON.stringify({ 'Billing & Finance': true }) });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toEqual({ 'Billing & Finance': true });
    });

    it('returns a stable snapshot identity, so useSyncExternalStore cannot loop', async () => {
        installStorage({ [STORAGE_KEY]: JSON.stringify({ 'Access & Security': true }) });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toBe(getSnapshot());
    });

    it('changes snapshot identity on write, so subscribers re-render', async () => {
        const { getSnapshot, setGroupOpen } = await loadModule();
        const before = getSnapshot();

        setGroupOpen('Communications', true);

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
                'System Health': true,
                Injected: { nested: 'object' },
                Sneaky: 'true',
            }),
        });
        const { getSnapshot } = await loadModule();

        expect(getSnapshot()).toEqual({ 'System Health': true });
    });

    it('ignores a stored array', async () => {
        installStorage({ [STORAGE_KEY]: JSON.stringify(['System Health']) });
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
        const { getSnapshot, setGroupOpen } = await loadModule();

        expect(getSnapshot()).toEqual({});
        // The write still applies in memory so the current page behaves.
        expect(() => setGroupOpen('System Health', true)).not.toThrow();
        expect(getSnapshot()).toEqual({ 'System Health': true });
    });

    it('survives the remount that app/template.tsx forces on every navigation', async () => {
        // The bug this store exists to fix: the sidebar is torn down and rebuilt
        // on each page change, so the choice has to be readable by a brand new
        // instance. Simulated by writing, then loading the module fresh.
        const store = installStorage();
        const first = await loadModule();
        first.setGroupOpen('Estate Configuration', true);

        vi.stubGlobal('sessionStorage', {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
        const remounted = await loadModule();

        expect(remounted.getSnapshot()).toEqual({ 'Estate Configuration': true });
    });
});
