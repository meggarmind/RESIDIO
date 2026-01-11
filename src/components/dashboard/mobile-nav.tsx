'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { useEstateLogo } from '@/hooks/use-estate-logo';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useMobileNavigation } from '@/hooks/use-navigation';

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mobile Navigation Component
 *
 * Displays a simplified navigation menu for mobile devices.
 * Uses shared navigation config with permission-based filtering.
 * Adapts styling based on active visual theme (Default vs Modern).
 *
 * Shows subset: Dashboard, Residents, Payments, Security, Settings
 */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const { navItems: filteredNavItems } = useMobileNavigation();
  const { themeId } = useVisualTheme();
  const { logoUrl } = useEstateLogo();

  const isModern = themeId === 'modern';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          'w-72 p-0',
          // Modern theme: dark navy background
          isModern && 'bg-[#1E293B] border-[#334155]'
        )}
      >
        <SheetHeader
          className={cn(
            'p-6 border-b',
            isModern && 'border-[#334155]'
          )}
        >
          <SheetTitle className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Estate Logo"
                className={cn(
                  'h-10 w-auto max-w-[140px] object-contain',
                  isModern && 'brightness-0 invert'
                )}
              />
            ) : (
              <>
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg text-white',
                    isModern ? 'rounded-xl bg-[#0EA5E9] shadow-lg' : 'bg-primary'
                  )}
                >
                  <span className={cn(isModern ? 'text-lg font-bold' : '')}>R</span>
                </div>
                <span className={cn(isModern ? 'text-2xl font-bold text-white' : '')}>
                  Residio
                </span>
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <nav className={cn('flex-1 px-4 py-4', isModern && 'px-6 py-6')}>
          <ul className={cn('space-y-1', isModern && 'space-y-2')}>
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isModern
                        ? cn(
                            // Modern theme styles
                            'rounded-xl px-4 py-3 gap-4 transition-all duration-200 relative',
                            isActive
                              ? 'bg-[#0EA5E9]/10 text-[#0EA5E9] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:rounded-r-full before:bg-[#0EA5E9]'
                              : 'text-gray-300 hover:bg-[#334155] hover:text-white'
                          )
                        : cn(
                            // Default theme styles
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          )
                    )}
                  >
                    <item.icon className={cn('h-4 w-4', isModern && 'h-5 w-5')} />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className={cn(
            'border-t p-4',
            isModern && 'border-[#334155] p-6'
          )}
        >
          <div
            className={cn(
              'flex items-center gap-3 px-3 py-2',
              isModern && 'gap-4 px-4 py-3 rounded-xl bg-[#334155]'
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
                isModern
                  ? 'h-10 w-10 bg-[#0EA5E9] text-white font-semibold'
                  : 'bg-muted'
              )}
            >
              {profile?.full_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 truncate">
              <p
                className={cn(
                  'text-sm font-medium truncate',
                  isModern && 'font-semibold text-white'
                )}
              >
                {profile?.full_name}
              </p>
              <p
                className={cn(
                  'text-xs capitalize',
                  isModern ? 'text-gray-400' : 'text-muted-foreground'
                )}
              >
                {profile?.role_display_name || profile?.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
