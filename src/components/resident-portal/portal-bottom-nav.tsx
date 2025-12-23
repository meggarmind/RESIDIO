'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CreditCard, Shield, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/invoices', label: 'Payments', icon: CreditCard },
  { href: '/portal/security-contacts', label: 'Contacts', icon: Shield },
  { href: '/portal/profile', label: 'Profile', icon: User },
];

/**
 * Portal Bottom Navigation
 *
 * A refined, touch-optimized bottom navigation bar with:
 * - 4 navigation items with icons and labels
 * - Active state with subtle animation
 * - Haptic-ready touch targets (44px minimum)
 * - Glass-morphism effect
 */
export function PortalBottomNav() {
  const pathname = usePathname();

  // Check if a nav item is active
  const isActive = (href: string) => {
    if (href === '/portal') {
      return pathname === '/portal';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-background/80 backdrop-blur-xl border-t border-border/40"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Subtle top gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-50 pointer-events-none" />

      <div className="relative h-full max-w-lg mx-auto px-2 flex items-center justify-around">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 w-full h-full',
                'transition-all duration-200 ease-out',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
                'active:scale-95',
                // Touch target padding
                'min-w-[44px] min-h-[44px]'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {/* Active indicator pill */}
              {active && (
                <div
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-primary
                             animate-in fade-in-0 zoom-in-50 duration-200"
                />
              )}

              {/* Icon container with active glow */}
              <div
                className={cn(
                  'relative flex items-center justify-center w-10 h-10 rounded-2xl',
                  'transition-all duration-200',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform duration-200',
                    active && 'scale-110'
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />

                {/* Subtle glow on active */}
                {active && (
                  <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-md" />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors duration-200',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Safe area spacer for iOS */}
      <div className="h-[env(safe-area-inset-bottom)] bg-background" />
    </nav>
  );
}
