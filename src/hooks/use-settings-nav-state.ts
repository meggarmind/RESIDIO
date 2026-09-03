'use client';

/**
 * Which settings sidebar groups the reader has opened or closed by hand.
 *
 * Kept outside React on purpose. `src/app/template.tsx` wraps the whole app,
 * and a Next.js `template` is re-instantiated on every navigation — so every
 * layout below it, the settings sidebar included, is remounted and loses its
 * state on each page change. Component state here did not survive a single
 * click: expanding "Estate Configuration" and then opening any settings page
 * collapsed it again.
 *
 * Persisted to `sessionStorage` rather than `localStorage`: the reader's
 * choice should last the session they are working in, not be re-imposed weeks
 * later when the estate's settings have moved on.
 *
 * Only groups the reader touched are recorded. A group they have never
 * interacted with is absent, which lets the sidebar fall back to "open the
 * group holding the current page" — see `settings-sidebar.tsx`.
 */

import { useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'residio-settings-nav-open-groups';
/**
 * Separate key from `STORAGE_KEY` on purpose — the open-groups blob is a map
 * keyed by group title, and folding "the last active group" into that same
 * object would risk colliding with a real group titled e.g. "null". Using a
 * second key also means an in-flight session holding only the old key (no
 * value under this one yet) degrades to "never observed", not a crash.
 */
const LAST_ACTIVE_GROUP_KEY = 'residio-settings-nav-last-active-group';

export type SettingsNavState = Record<string, boolean>;

/** Shared empty object, so the server snapshot is referentially stable. */
const EMPTY: SettingsNavState = {};

let state: SettingsNavState | null = null;
const listeners = new Set<() => void>();

function read(): SettingsNavState {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY;
        // Drop anything that is not a boolean rather than trusting the blob.
        const clean: SettingsNavState = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === 'boolean') clean[key] = value;
        }
        return clean;
    } catch {
        // Private browsing, disabled storage, or corrupt JSON. Falling back to
        // "no overrides" is correct: the sidebar then opens the active group.
        return EMPTY;
    }
}

export function getSnapshot(): SettingsNavState {
    // Cached, because useSyncExternalStore compares snapshots by identity and
    // re-parsing on every render would return a new object each time and loop.
    if (state === null) state = read();
    return state;
}

/** No sessionStorage while rendering on the server; nothing is overridden yet. */
function getServerSnapshot(): SettingsNavState {
    return EMPTY;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Writes a new snapshot, persists it, and wakes every subscriber. */
function commit(next: SettingsNavState): void {
    state = next;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage unavailable — keep the in-memory value so the current page
        // still behaves, and accept that a reload forgets it.
    }
    listeners.forEach((listener) => listener());
}

export function setGroupOpen(title: string, open: boolean): void {
    commit({ ...getSnapshot(), [title]: open });
}

/**
 * The group (if any) holding the page the reader was most recently on.
 *
 * Module-level for the same reason `state` is: `src/app/template.tsx`
 * remounts everything below it on every navigation, so a `useRef` here would
 * reset on the very next click and this would never detect a transition.
 *
 * But module-level in-memory alone is not enough: a *full page load* (an
 * external link straight into a settings page, not a client-side nav) starts
 * a brand new module instance with no in-memory history at all — the exact
 * case as "the reader closed this group while already inside it, then hit
 * reload." Both look like "no previous group known" unless the previous
 * group is itself persisted, so it survives that reload the same way the
 * open-groups map does. Persisted to `sessionStorage` under a separate key —
 * see `LAST_ACTIVE_GROUP_KEY` above.
 *
 * `undefined` means "not loaded from storage yet" (see `lastActiveGroupLoaded`
 * below); once loaded, `null` legitimately means "nothing recorded" — a
 * genuinely fresh session, or a page outside every group. Neither is treated
 * as a transition: there is no "outside" to have arrived from.
 */
let lastActiveGroup: string | null | undefined;
let lastActiveGroupLoaded = false;

/** Lazily hydrates `lastActiveGroup` from sessionStorage, once per module life. */
function loadLastActiveGroup(): void {
    if (lastActiveGroupLoaded) return;
    lastActiveGroupLoaded = true;
    try {
        const raw = sessionStorage.getItem(LAST_ACTIVE_GROUP_KEY);
        if (raw === null) return; // nothing recorded yet
        const parsed: unknown = JSON.parse(raw);
        // Accept only the shapes this module ever writes; anything else
        // (a stale value from a differently shaped release, corrupt JSON)
        // is treated the same as "nothing recorded".
        if (parsed === null || typeof parsed === 'string') {
            lastActiveGroup = parsed;
        }
    } catch {
        // Private browsing, disabled storage, or corrupt JSON.
    }
}

/**
 * Reopens a group the moment the active group changes *into* it from
 * somewhere else — the landing card grid, a search result, a bookmark, an
 * external link (including a full page load) — so the page being viewed is
 * never hidden behind a collapsed group. Moving between pages that stay
 * inside the same group is not a transition and leaves a deliberate collapse
 * alone.
 *
 * Call this on every render with the group title holding the current page
 * (or `null` on a page outside every group); it is idempotent, so two nav
 * surfaces (desktop + mobile) mounted at once and calling it with the same
 * value in the same commit is safe.
 */
export function noteActiveGroup(activeGroup: string | null): void {
    loadLastActiveGroup();
    const previous = lastActiveGroup;
    lastActiveGroup = activeGroup;
    try {
        sessionStorage.setItem(LAST_ACTIVE_GROUP_KEY, JSON.stringify(activeGroup));
    } catch {
        // Storage unavailable — keep the in-memory value so this page still
        // behaves, and accept that a reload forgets it.
    }

    if (previous === undefined) return; // never recorded — nothing to transition from
    if (activeGroup === null || activeGroup === previous) return; // not a transition into a group
    if (getSnapshot()[activeGroup] !== false) return; // nothing stale to clear

    const next = { ...getSnapshot() };
    delete next[activeGroup];
    commit(next);
}

export interface UseSettingsNavStateResult {
    /** Groups the reader has explicitly opened or closed, by group title. */
    userToggled: SettingsNavState;
    setGroupOpen: (title: string, open: boolean) => void;
}

/**
 * @param activeGroupTitle The group holding the current page, or `null` if
 * the current page is outside every group. Passed through to
 * {@link noteActiveGroup} so entering a collapsed group from outside reopens
 * it; omit only for callers that don't render group-open state at all.
 */
export function useSettingsNavState(activeGroupTitle: string | null = null): UseSettingsNavStateResult {
    const userToggled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    // An effect, not inline in render: mutating the shared store and waking
    // other subscribers belongs after commit, the same as any other store
    // write (see `setGroupOpen`, called from event handlers). Doing it here
    // during render risks updating a sibling nav surface's subscription
    // while this component is still mid-render.
    useEffect(() => {
        noteActiveGroup(activeGroupTitle);
    }, [activeGroupTitle]);

    return { userToggled, setGroupOpen };
}

/** Test seam: drops the cached snapshot, the stored value, and the
 * remembered active group (both the in-memory cache and its persisted copy). */
export function __resetSettingsNavStateForTests(): void {
    state = null;
    lastActiveGroup = undefined;
    lastActiveGroupLoaded = false;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(LAST_ACTIVE_GROUP_KEY);
    } catch {
        /* ignore */
    }
}
