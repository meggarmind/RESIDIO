'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useSettingsSections } from '@/components/settings/settings-sections-provider';

/** Sticky "On this page" tabs, one per visible section. Pills are kept for status, so these are rectangles. */
export function SettingsPageNav() {
  const { sections, goToSection } = useSettingsSections();
  const visible = sections.filter((s) => s.visible);
  const [current, setCurrent] = React.useState<string | null>(null);
  const ids = visible.map((s) => s.id).join('|');

  React.useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let active: string | null = null;
      for (const id of ids.split('|').filter(Boolean)) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) active = id;
      }
      setCurrent(active ?? ids.split('|')[0] ?? null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 py-2 backdrop-blur md:-mx-8 md:px-8"
    >
      <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {visible.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={current === s.id ? 'true' : undefined}
              onClick={(e) => {
                e.preventDefault();
                goToSection(s.id);
              }}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-card px-3 text-sm font-medium md:min-h-9',
                current === s.id && 'border-transparent bg-primary text-primary-foreground',
              )}
            >
              {s.title}
              {s.dirty && (
                <>
                  {' '}
                  <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
                  <span className="sr-only">(unsaved)</span>
                </>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
