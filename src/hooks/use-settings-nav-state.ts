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

import { useSyncExternalStore } from 'react';

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

export function setGroupOpen(title: string, open: boolean): void {
    state = { ...getSnapshot(), [title]: open };
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage unavailable — keep the in-memory value so the current page
        // still behaves, and accept that a reload forgets it.
    }
    listeners.forEach((listener) => listener());
}

export interface UseSettingsNavStateResult {
    /** Groups the reader has explicitly opened or closed, by group title. */
    userToggled: SettingsNavState;
    setGroupOpen: (title: string, open: boolean) => void;
}

export function useSettingsNavState(): UseSettingsNavStateResult {
    const userToggled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    // `setGroupOpen` is module-level, so its identity is already stable — no
    // useCallback needed.
    return { userToggled, setGroupOpen };
}

/** Test seam: drops the cached snapshot and the stored value. */
export function __resetSettingsNavStateForTests(): void {
    state = null;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
