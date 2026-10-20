'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { activeSettingsHref, findSettingsEntry } from '@/config/settings-nav';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';

/**
 * The heading every settings page shares (#786): an h3 under the layout's
 * "Settings" h2, with the title and description taken from `settings-nav.ts`
 * unless given, so the page and the menu cannot name it differently.
 *
 * Pass `isDirty` to warn before leaving with unsaved changes, and `onSave` to
 * show a save bar that stays in view while the page scrolls.
 */
export function SettingsPageHeader({
  title,
  description,
  actions,
  breadcrumb = true,
  isDirty = false,
  isSaving = false,
  onSave,
  onDiscard,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}) {
  const pathname = usePathname();
  const { groups } = useSettingsNavigation();
  const activeHref = activeSettingsHref(pathname, groups);
  const entry = activeHref ? findSettingsEntry(activeHref, groups) : null;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const trail = entry ? [entry.group.title, entry.parent?.title].filter(Boolean) : [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {breadcrumb && pathname !== '/settings' && trail.length > 0 && (
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Link href="/settings" className="hover:text-foreground">
                Settings
              </Link>
              {trail.map((crumb) => (
                <span key={crumb} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  {crumb}
                </span>
              ))}
            </nav>
          )}
          <h3 className="text-lg font-medium">{title ?? entry?.item.title}</h3>
          {(description ?? entry?.item.description) && (
            <p className="text-sm text-muted-foreground">{description ?? entry?.item.description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {isDirty && onSave && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-md border bg-background/95 px-4 py-2 shadow-sm backdrop-blur"
        >
          <span className="text-sm">You have unsaved changes.</span>
          <div className="flex items-center gap-2">
            {onDiscard && (
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
                Discard
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
