'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { useEstateLogo } from '@/hooks/use-estate-logo';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useSectionedNavigation } from '@/hooks/use-navigation';

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mobile Navigation Component
 *
 * Displays the admin navigation menu for mobile devices.
 * Uses shared navigation config with permission-based filtering.
 * Mirrors the desktop sidebar information architecture, grouped by section.
 * Styling follows the active theme tokens.
 */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { sections } = useSectionedNavigation();
  const { logoUrl } = useEstateLogo();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Estate Logo"
                className="h-10 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white bg-primary">
                  <span>R</span>
                </div>
                <span>Residio</span>
              </>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navigate between administration areas and account controls.
          </SheetDescription>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto px-4 py-4">
          {sections.map((section) => (
            <div key={section.id} className={cn(sections[0] !== section && 'mt-5')}>
              {section.label && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  // Children arrive already permission-filtered from the shared hook.
                  // A child sharing its parent's href is the same destination: skip it.
                  const children = (item.children ?? []).filter(
                    (child) => child.href !== item.href
                  );
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => onOpenChange(false)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="truncate">{item.mobileLabel ?? item.title}</span>
                      </Link>
                      {children.length > 0 && (
                        <ul className="ml-5 mt-1 space-y-1 border-l pl-2">
                          {children.map((child) => {
                            const isChildActive = pathname === child.href;
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.href}
                                  onClick={() => onOpenChange(false)}
                                  aria-current={isChildActive ? 'page' : undefined}
                                  className={cn(
                                    'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                    isChildActive
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                  )}
                                >
                                  <child.icon className="h-3.5 w-3.5" />
                                  <span className="truncate">{child.mobileLabel ?? child.title}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t p-4">
          <ThemeSwitcher variant="compact" className="mb-3" />
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium bg-muted">
              {profile?.full_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs capitalize text-muted-foreground">
                {profile?.role_display_name}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
