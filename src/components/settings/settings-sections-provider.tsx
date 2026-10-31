'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
import { cn } from '@/lib/utils';

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

/** The first tab of a page with tabs: one card per section (#1365). */
export const SUMMARY_TAB = 'summary';

interface SettingsSectionsContextValue {
  groups: SettingsGroup[];
  sections: RegisteredSection[];
  register: (section: RegisteredSection) => void;
  unregister: (id: string) => void;
  setHandles: (id: string, handles: SectionHandles) => void;
  /** Shows the section's tab, opens the section and focuses its header button. */
  goToSection: (id: string) => void;
  /**
   * The tab on show (#1365): SUMMARY_TAB or a section id. Null when the page shows every
   * section at once: no page nav is mounted, or fewer than two sections are visible.
   */
  activeTab: string | null;
  /** Shows the Summary tab. */
  goToSummary: () => void;
  /** Where each section renders its Summary card (the page nav's grid); null without one. */
  summaryEl: HTMLElement | null;
  setSummaryEl: (el: HTMLElement | null) => void;
  /** Each section's place on the page, so the Summary cards keep the page order. */
  order: Record<string, number>;
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

/**
 * A plain block with a jump tab, for pages outside Settings whose content is already cards
 * (#1273). Registers like a SettingsSection, but has no header, fold or save footer.
 */
export function JumpSection({
  id,
  title,
  summary,
  className,
  children,
}: {
  id: string;
  title: string;
  /** The key value shown on this section's Summary card (#1365). */
  summary?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const page = useOptionalSettingsSections();
  const register = page?.register;
  const unregister = page?.unregister;
  const setHandles = page?.setHandles;
  React.useEffect(() => {
    register?.({ id, title, dirty: false, visible: true, canSave: true });
  }, [register, id, title]);
  React.useEffect(() => {
    // Nothing to save or fold; the handle lets a #hash link open the section.
    setHandles?.(id, { save: async () => true, setOpen: () => {} });
  }, [setHandles, id]);
  React.useEffect(() => () => unregister?.(id), [unregister, id]);
  return (
    <>
      <section
        id={id}
        aria-label={title}
        hidden={!isSectionShown(page, id)}
        className={className ? `scroll-mt-20 ${className}` : 'scroll-mt-20'}
      >
        {children}
      </section>
      <SectionSummaryCard id={id} title={title} summary={summary} />
    </>
  );
}

/** Whether a section is on show: always without tabs, else only on its own tab (#1365). */
export function isSectionShown(page: SettingsSectionsContextValue | null, id: string): boolean {
  return !page || page.activeTab === null || page.activeTab === id;
}

/**
 * A section's card on the Summary tab, rendered into the page nav's grid (#1365). Nothing
 * renders while the page has no Summary tab.
 */
export function SectionSummaryCard({
  id,
  title,
  summary,
  dirty = false,
  warning = false,
}: {
  id: string;
  title: string;
  summary?: React.ReactNode;
  dirty?: boolean;
  warning?: boolean;
}) {
  const page = useOptionalSettingsSections();
  if (!page?.summaryEl || page.activeTab === null) return null;
  return createPortal(
    <button
      type="button"
      onClick={() => page.goToSection(id)}
      style={{ order: page.order[id] ?? 0 }}
      className={cn(
        'flex min-w-0 flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        (dirty || warning) && 'border-warning/40',
      )}
    >
      <span className="flex flex-wrap items-center gap-2 font-semibold">
        {title}
        {dirty && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
            Unsaved
          </span>
        )}
      </span>
      {summary !== undefined && summary !== null && (
        <span className="w-full min-w-0 text-sm text-muted-foreground">{summary}</span>
      )}
      <span className="mt-auto text-sm font-medium text-primary">
        Open {title} <span aria-hidden>→</span>
      </span>
    </button>,
    page.summaryEl,
  );
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
  const [summaryEl, setSummaryEl] = React.useState<HTMLElement | null>(null);
  const [order, setOrder] = React.useState<Record<string, number>>({});

  // Tabs (#1365): the chosen tab lives in ?section=, so a link can open one and Back returns.
  // Not ?tab=, which Roles & Access uses for its own tabs.
  const sectionParam = searchParams?.get('section') ?? null;
  const [chosenTab, setChosenTab] = React.useState<string | null>(sectionParam);
  React.useEffect(() => {
    setChosenTab(sectionParam);
  }, [sectionParam]);

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

  const visibleSections = sections.filter((s) => s.visible);
  // The page nav provides the Summary grid; without it (or with one section) every section shows.
  const tabbed = summaryEl !== null && visibleSections.length >= 2;
  const activeTab = !tabbed
    ? null
    : chosenTab && visibleSections.some((s) => s.id === chosenTab)
      ? chosenTab
      : SUMMARY_TAB;

  const tabbedRef = React.useRef(tabbed);
  tabbedRef.current = tabbed;
  const showTab = React.useCallback(
    (tab: string) => {
      setChosenTab(tab);
      const params = new URLSearchParams(window.location.search);
      params.delete('row');
      if (tab === SUMMARY_TAB) params.delete('section');
      else params.set('section', tab);
      const query = params.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [router],
  );

  const goToSection = React.useCallback(
    (id: string) => {
      // Chosen even before tabs apply, so a #hash link that lands while sections still register
      // opens its tab once the second section arrives.
      if (tabbedRef.current) showTab(id);
      else setChosenTab(id);
      handlesRef.current.get(id)?.setOpen(true);
      // Wait one frame so a hidden or collapsed body is shown before we scroll and focus.
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        // With tabs the section is the only content: keep the tab row in view instead.
        if (el && !tabbedRef.current) scrollToEl(el);
        document.getElementById(`${id}-toggle`)?.focus({ preventScroll: true });
      });
    },
    [showTab],
  );
  const goToSummary = React.useCallback(() => showTab(SUMMARY_TAB), [showTab]);

  // Summary cards follow the sections' order on the page, not the order they registered in.
  const sectionIds = visibleSections.map((s) => s.id).join('|');
  React.useLayoutEffect(() => {
    const ids = sectionIds.split('|').filter(Boolean);
    const els = ids.map((id) => [id, document.getElementById(id)] as const);
    els.sort(([, a], [, b]) => (a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1));
    const next = Object.fromEntries(els.map(([id], i) => [id, i]));
    setOrder((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [sectionIds]);

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
    setChosenTab(match.section.id);
    handlesRef.current.get(match.section.id)?.setOpen(true);
    let cleanup = () => {};
    let frame = 0;
    let tries = 0;
    const run = () => {
      const el = document.getElementById(match.row.id);
      // Section bodies mount only after auth loads, so wait a few frames for the row; a row on a
      // tab that is still hidden waits for the tab to show (#1365).
      if (!el || el.closest('[hidden]')) {
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
    () => ({ groups, sections, register, unregister, setHandles, goToSection, activeTab, goToSummary, summaryEl, setSummaryEl, order }),
    [groups, sections, register, unregister, setHandles, goToSection, activeTab, goToSummary, summaryEl, order],
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
