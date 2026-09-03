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
const LAST_ACTIVE_GROUP_KEY = 'residio-settings-nav-last-active-group';

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

describe('reopen-on-entry (noteActiveGroup)', () => {
    // The rule under test: collapsing a group holds while the reader browses
    // elsewhere, but the moment the active group transitions *into* a
    // collapsed group from somewhere else, the stale `false` override is
    // cleared so the page the reader landed on is not hidden in the menu.
    // Moving between pages that stay inside the same group is not a
    // transition and must not touch the override.

    it('entering a group from outside clears its false override', async () => {
        const { getSnapshot, setGroupOpen, noteActiveGroup } = await loadModule();

        // Reader collapses "Estate Configuration" while on a page in
        // "Access & Security", then browses within Access & Security.
        setGroupOpen('Estate Configuration', false);
        noteActiveGroup('Access & Security'); // first observation this session
        noteActiveGroup('Access & Security'); // still inside Access & Security

        expect(getSnapshot()).toHaveProperty('Estate Configuration', false);

        // Reader clicks into Estate Configuration from the landing grid.
        noteActiveGroup('Estate Configuration');

        expect(getSnapshot()).not.toHaveProperty('Estate Configuration');
    });

    it('moving between pages within the same group preserves the override', async () => {
        const { getSnapshot, setGroupOpen, noteActiveGroup } = await loadModule();

        // Reader is already inside "Estate Configuration" (first observation),
        // deliberately collapses it, then navigates to another page still
        // inside the same group.
        noteActiveGroup('Estate Configuration');
        setGroupOpen('Estate Configuration', false);
        noteActiveGroup('Estate Configuration');

        expect(getSnapshot()).toHaveProperty('Estate Configuration', false);
    });

    it('leaves a group the reader never toggled untouched', async () => {
        const { getSnapshot, noteActiveGroup } = await loadModule();

        noteActiveGroup('Access & Security'); // first observation
        noteActiveGroup('Estate Configuration'); // transition into an untouched group

        expect(getSnapshot()).toEqual({});
    });

    it('keeps a deliberate collapse across a full reload while still inside the group', async () => {
        // A `useRef`-only "previous group" would not survive a full page
        // load: a fresh module has no in-memory history, so this exercises
        // that `lastActiveGroup` is read back from sessionStorage instead.
        const store = installStorage();
        const before = await loadModule();
        before.noteActiveGroup('Estate Configuration'); // reader is already inside the group
        before.setGroupOpen('Estate Configuration', false); // ...and collapses it deliberately
        before.noteActiveGroup('Estate Configuration'); // navigates to another page, still inside
        expect(before.getSnapshot()).toHaveProperty('Estate Configuration', false);

        // Full page load: a brand new module instance, but the same
        // sessionStorage-backed tab.
        vi.stubGlobal('sessionStorage', {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
        const reloaded = await loadModule();
        reloaded.noteActiveGroup('Estate Configuration'); // reader reloads on a page still in the group

        expect(reloaded.getSnapshot()).toHaveProperty('Estate Configuration', false);
    });

    it('reopens a collapsed group entered via a full page load (external link) from another group', async () => {
        // Simulates the reader having been inside "Access & Security" and
        // having collapsed "Estate Configuration" earlier, then closing the
        // tab or following a link that lands directly on a page inside
        // "Estate Configuration" — a full page load, so there is no
        // client-side navigation history, only sessionStorage.
        installStorage({
            [LAST_ACTIVE_GROUP_KEY]: JSON.stringify('Access & Security'),
            [STORAGE_KEY]: JSON.stringify({ 'Estate Configuration': false }),
        });
        const { getSnapshot, noteActiveGroup } = await loadModule();

        noteActiveGroup('Estate Configuration');

        expect(getSnapshot()).not.toHaveProperty('Estate Configuration');
    });

    it('leaves a true override alone when re-entering the group', async () => {
        const { getSnapshot, setGroupOpen, noteActiveGroup } = await loadModule();

        setGroupOpen('Estate Configuration', true);
        noteActiveGroup('Access & Security');
        noteActiveGroup('Estate Configuration');

        expect(getSnapshot()).toHaveProperty('Estate Configuration', true);
    });
});
