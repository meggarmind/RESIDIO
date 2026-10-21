'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { findSettingsRow, settingsConfig, type SettingsGroup } from '@/config/settings-nav';

/** What a section tells the page about itself. Changes here re-render the page nav and the guard. */
export interface RegisteredSection {
  id: string;
  title: string;
  dirty: boolean;
  visible: boolean;
  canSave: boolean;
  saveBlockedReason?: string;
}

/** Imperative handles. Kept out of state so a new callback each render does not loop. */
export interface SectionHandles {
  /** Resolves true when the save worked. */
  save: () => Promise<boolean>;
  setOpen: (open: boolean) => void;
}

interface SettingsSectionsContextValue {
  groups: SettingsGroup[];
  sections: RegisteredSection[];
  register: (section: RegisteredSection) => void;
  unregister: (id: string) => void;
  setHandles: (id: string, handles: SectionHandles) => void;
  /** Opens the section, scrolls to it and focuses its header button. */
  goToSection: (id: string) => void;
}

const SettingsSectionsContext = React.createContext<SettingsSectionsContextValue | null>(null);

/** Null outside a provider, so a section can still render on its own. */
export function useOptionalSettingsSections() {
  return React.useContext(SettingsSectionsContext);
}

export function useSettingsSections() {
  const ctx = React.useContext(SettingsSectionsContext);
  if (!ctx) throw new Error('useSettingsSections must be used inside <SettingsSectionsProvider>');
  return ctx;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function scrollToEl(el: Element) {
  el.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

const FOCUSABLE =
  'input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[role=switch]:not([disabled]),[role=combobox]:not([disabled])';

function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? '';
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

export function SettingsSectionsProvider({
  children,
  groups = settingsConfig,
}: {
  children: React.ReactNode;
  groups?: SettingsGroup[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sections, setSections] = React.useState<RegisteredSection[]>([]);
  const handlesRef = React.useRef(new Map<string, SectionHandles>());
  const [announcement, setAnnouncement] = React.useState('');
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  const register = React.useCallback((next: RegisteredSection) => {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === next.id);
      if (i === -1) return [...prev, next];
      const cur = prev[i];
      if (
        cur.title === next.title &&
        cur.dirty === next.dirty &&
        cur.visible === next.visible &&
        cur.canSave === next.canSave &&
        cur.saveBlockedReason === next.saveBlockedReason
      ) {
        return prev;
      }
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
  }, []);
  const unregister = React.useCallback((id: string) => {
    handlesRef.current.delete(id);
    setSections((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const setHandles = React.useCallback((id: string, h: SectionHandles) => {
    handlesRef.current.set(id, h);
  }, []);

  const goToSection = React.useCallback((id: string) => {
    handlesRef.current.get(id)?.setOpen(true);
    // Wait one frame so a collapsed body is shown before we scroll and focus.
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) scrollToEl(el);
      document.getElementById(`${id}-toggle`)?.focus({ preventScroll: true });
    });
  }, []);

  const dirtySections = sections.filter((s) => s.dirty && s.visible);
  const anyDirty = dirtySections.length > 0;
  const blocked = dirtySections.filter((s) => !s.canSave);

  // Leave guard: in-app links get a dialog that names the sections.
  React.useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(a.getAttribute('href') ?? '', window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    // Fallback for closing the tab; browsers show their own wording.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [anyDirty]);

  const leave = (href: string) => {
    setPendingHref(null);
    router.push(href);
  };

  const saveAndLeave = async () => {
    if (!pendingHref) return;
    setLeaving(true);
    let ok = true;
    for (const s of dirtySections) {
      const saved = await handlesRef.current.get(s.id)?.save();
      if (!saved) ok = false;
    }
    setLeaving(false);
    if (ok) leave(pendingHref);
  };

  // Row search: ?row=<id> opens the section, scrolls, focuses and highlights the row.
  const rowParam = searchParams?.get('row') ?? null;
  const registeredIds = sections.map((s) => s.id).join('|');
  React.useEffect(() => {
    if (!rowParam) return;
    const match = findSettingsRow(rowParam, groups);
    if (!match || !sections.some((s) => s.id === match.section.id && s.visible)) return;
    handlesRef.current.get(match.section.id)?.setOpen(true);
    let cleanup = () => {};
    let frame = 0;
    let tries = 0;
    const run = () => {
      const el = document.getElementById(match.row.id);
      // Section bodies mount only after auth loads, so wait a few frames for the row.
      if (!el) {
        if (++tries < 60) frame = requestAnimationFrame(run);
        return;
      }
      el.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus({ preventScroll: true });
      el.setAttribute('data-hit', 'true');
      setAnnouncement(`${match.row.label}, in ${match.section.title}`);
      const clear = (ev: Event) => {
        if (ev instanceof KeyboardEvent && (ev.key === 'Tab' || ev.key === 'Shift')) return;
        el.removeAttribute('data-hit');
        cleanup();
      };
      document.addEventListener('pointerdown', clear);
      document.addEventListener('keydown', clear);
      cleanup = () => {
        document.removeEventListener('pointerdown', clear);
        document.removeEventListener('keydown', clear);
      };
    };
    frame = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(frame);
      cleanup();
    };
    // sections is read through registeredIds so a dirty flip does not re-run the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowParam, pathname, groups, registeredIds]);

  // Old routes redirect to `new#section` (#791): open that section once it has registered.
  // A ?row= hit handles its own section, so the hash is left alone then.
  const hashHandled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (rowParam) return;
    const hash = window.location.hash.slice(1);
    if (!hash || hashHandled.current === hash) return;
    const target = sections.find((s) => s.id === hash && s.visible);
    if (!target || !handlesRef.current.has(hash)) return;
    hashHandled.current = hash;
    goToSection(hash);
  }, [rowParam, pathname, registeredIds, sections, goToSection]);

  const value = React.useMemo(
    () => ({ groups, sections, register, unregister, setHandles, goToSection }),
    [groups, sections, register, unregister, setHandles, goToSection],
  );

  const names = joinTitles(dirtySections.map((s) => s.title));
  const verb = dirtySections.length === 1 ? 'has' : 'have';

  return (
    <SettingsSectionsContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <AlertDialog open={pendingHref !== null} onOpenChange={(o) => !o && !leaving && setPendingHref(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this page?</AlertDialogTitle>
            <AlertDialogDescription>
              {names} {verb} unsaved changes. If you leave now, they are lost.
            </AlertDialogDescription>
            {blocked.length > 0 && (
              <p className="text-sm text-warning">
                Save and leave is off.{' '}
                {blocked.map((s) => `${s.title}: ${s.saveBlockedReason ?? 'fix the errors first.'}`).join(' ')}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" className="min-h-11 md:min-h-9" disabled={leaving} onClick={() => setPendingHref(null)}>
              Stay on this page
            </Button>
            <Button
              variant="outline"
              className="min-h-11 md:min-h-9"
              disabled={leaving}
              onClick={() => pendingHref && leave(pendingHref)}
            >
              Leave without saving
            </Button>
            <Button className="min-h-11 md:min-h-9" disabled={leaving || blocked.length > 0} onClick={saveAndLeave}>
              {leaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSectionsContext.Provider>
  );
}
