'use client';

/**
 * Which main sidebar submenus the reader has opened or closed by hand.
 *
 * Kept outside React on purpose. `src/app/template.tsx` wraps the whole app,
 * and a Next.js `template` is re-instantiated on every navigation — so every
 * layout below it, `DashboardShell` and `Sidebar` included, is remounted and
 * loses its state on each page change. Component state here did not survive
 * a single click: expanding "Transactions" and then navigating anywhere else
 * collapsed it again, even before the reader had a chance to click into it.
 *
 * Persisted to `sessionStorage` rather than `localStorage`: the reader's
 * choice should last the session they are working in, not be re-imposed weeks
 * later when the sidebar's structure has moved on.
 *
 * Only menus the reader touched are recorded. A menu they have never
 * interacted with is absent, which lets the sidebar fall back to "open the
 * menu holding the current page" — see `sidebar.tsx`.
 *
 * Modelled on `use-settings-nav-state.ts`, which fixed the same remount loss
 * for the settings sidebar. This hook uses a different sessionStorage key —
 * the two sidebars track separate sets of menus.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'residio-sidebar-nav-open-menus';

export type SidebarNavState = Record<string, boolean>;

/** Shared empty object, so the server snapshot is referentially stable. */
const EMPTY: SidebarNavState = {};

let state: SidebarNavState | null = null;
const listeners = new Set<() => void>();

function read(): SidebarNavState {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY;
        // Drop anything that is not a boolean rather than trusting the blob.
        const clean: SidebarNavState = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === 'boolean') clean[key] = value;
        }
        return clean;
    } catch {
        // Private browsing, disabled storage, or corrupt JSON. Falling back to
        // "no overrides" is correct: the sidebar then opens the active menu.
        return EMPTY;
    }
}

export function getSnapshot(): SidebarNavState {
    // Cached, because useSyncExternalStore compares snapshots by identity and
    // re-parsing on every render would return a new object each time and loop.
    if (state === null) state = read();
    return state;
}

/** No sessionStorage while rendering on the server; nothing is overridden yet. */
function getServerSnapshot(): SidebarNavState {
    return EMPTY;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setMenuOpen(id: string, open: boolean): void {
    state = { ...getSnapshot(), [id]: open };
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage unavailable — keep the in-memory value so the current page
        // still behaves, and accept that a reload forgets it.
    }
    listeners.forEach((listener) => listener());
}

export interface UseSidebarNavStateResult {
    /** Menus the reader has explicitly opened or closed, by menu id. */
    userToggled: SidebarNavState;
    setMenuOpen: (id: string, open: boolean) => void;
}

export function useSidebarNavState(): UseSidebarNavStateResult {
    const userToggled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    // `setMenuOpen` is module-level, so its identity is already stable — no
    // useCallback needed.
    return { userToggled, setMenuOpen };
}

/** Test seam: drops the cached snapshot and the stored value. */
export function __resetSidebarNavStateForTests(): void {
    state = null;
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
