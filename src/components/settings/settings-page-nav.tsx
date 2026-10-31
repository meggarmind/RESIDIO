'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { SUMMARY_TAB, useSettingsSections } from '@/components/settings/settings-sections-provider';

/**
 * The page's tabs (#1365, owner choice "Summary tab first"): Summary, then one tab per visible
 * section. Each tab shows only its own section; Summary shows one card per section, which the
 * sections render into the grid below. Pills are kept for status, so these are rectangles.
 */
export function SettingsPageNav() {
  const { sections, activeTab, goToSection, goToSummary, setSummaryEl } = useSettingsSections();
  const visible = sections.filter((s) => s.visible);
  const tabs = [{ id: SUMMARY_TAB, title: 'Summary', dirty: visible.some((s) => s.dirty) }, ...visible];
  const listRef = React.useRef<HTMLDivElement>(null);

  // Arrow keys move between tabs, as in any tablist.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, tabs.findIndex((t) => t.id === activeTab));
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const id = tabs[next].id;
    if (id === SUMMARY_TAB) goToSummary();
    else goToSection(id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
  };

  return (
    <>
      {activeTab !== null && (
        <nav
          aria-label="On this page"
          className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 py-2 backdrop-blur md:-mx-8 md:px-8"
        >
          <div ref={listRef} role="tablist" aria-label="Sections" onKeyDown={onKeyDown} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {tabs.map((t) => {
              const selected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  data-tab={t.id}
                  id={`${t.id}-tab`}
                  aria-selected={selected}
                  aria-controls={t.id === SUMMARY_TAB ? 'section-summary' : t.id}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => (t.id === SUMMARY_TAB ? goToSummary() : goToSection(t.id))}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-card px-3 text-sm font-medium',
                    selected && 'border-transparent bg-primary text-primary-foreground',
                  )}
                >
                  {t.title}
                  {t.dirty && (
                    <>
                      {' '}
                      <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
                      <span className="sr-only">(unsaved)</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
      {/* Always mounted: it is how the provider knows the page has tabs. The sections fill it. */}
      <div
        ref={setSummaryEl}
        id="section-summary"
        role="tabpanel"
        aria-label="Summary"
        hidden={activeTab !== SUMMARY_TAB}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      />
    </>
  );
}
