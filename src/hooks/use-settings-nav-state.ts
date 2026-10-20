'use client';

/**
 * Which settings sidebar groups the reader has opened or closed by hand.
 *
 * A module-level store rather than component state so the desktop sidebar
 * and the mobile nav share one record: opening a group on one is reflected on
 * the other. (It also used to be the only way to survive `app/template.tsx`
 * remounting the settings layout on every click; since #786 the template
 * keeps one key for all of Settings, so that no longer happens.)
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
 * The group holding the page the reader was last on, in this page load.
 * `undefined` until the first observation, so landing on a page by a full
 * load (an external link, a bookmark, a reload) counts as entering its group.
 */
let lastActiveGroup: string | null | undefined;

/**
 * Reopens a group the moment the active group changes *into* it from
 * somewhere else — the landing card grid, a search result, a bookmark, an
 * external link, a reload — so the page being viewed is
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
    const previous = lastActiveGroup;
    lastActiveGroup = activeGroup;

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
 * remembered active group. */
export function __resetSettingsNavStateForTests(): void {
    state = null;
    lastActiveGroup = undefined;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
