'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, Wallet, Shield, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

/**
 * Navigation items ordered by usage frequency:
 * 1. Home - Entry point
 * 2. Bills - Primary action (check/pay invoices)
 * 3. Wallet - Payment balance
 * 4. Contacts - Security contacts
 * 5. Profile - Settings (least frequent)
 */
const navItems: NavItem[] = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/invoices', label: 'Bills', icon: Receipt },
  { href: '/portal/wallet', label: 'Wallet', icon: Wallet },
  { href: '/portal/security-contacts', label: 'Contacts', icon: Shield },
  { href: '/portal/profile', label: 'Profile', icon: User },
];

/**
 * Portal Bottom Navigation - Modern Design System
 *
 * Touch-optimized mobile navigation bar (64px height) following the portal-modern design system.
 *
 * Design Specifications:
 * - Height: 64px (var(--bottom-nav-height))
 * - Background: White card (var(--color-bg-card))
 * - Border top: 1px subtle gray
 * - 5 navigation items with icons and labels
 * - Icon size: 24px (var(--icon-md))
 * - Active state: Primary color icon + label
 * - Inactive state: Muted gray
 * - Touch targets: 44x44px minimum
 * - Safe area insets for iOS
 *
 * Accessibility:
 * - aria-current for active page
 * - Touch-friendly targets (44px)
 * - Focus visible ring
 */
interface PortalBottomNavProps {
  className?: string;
  style?: React.CSSProperties;
}

export function PortalBottomNav({ className, style }: PortalBottomNavProps) {
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
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-colors duration-300",
        className
      )}
      style={style}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="h-full flex items-center justify-around px-4">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1',
                'transition-all duration-150 ease-out',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
                'active:scale-95',
                // Touch target
                'min-w-[44px] min-h-[44px]'
              )}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
            >
              {/* Icon */}
              <Icon
                className={cn(
                  'transition-all duration-150',
                  active && 'scale-110'
                )}
                style={{
                  width: 'var(--icon-md)', // 24px
                  height: 'var(--icon-md)',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  strokeWidth: active ? '2.5' : '2',
                }}
              />

              {/* Label */}
              <span
                className={cn(
                  'transition-colors duration-150',
                  active ? 'font-medium' : 'font-normal'
                )}
                style={{
                  fontSize: '10px',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                }}
              >
                {item.label}
              </span>

              {/* Active indicator dot (top) */}
              {active && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full animate-in fade-in-0 zoom-in-50 duration-200"
                  style={{
                    background: 'var(--color-primary)',
                  }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Safe area spacer for iOS */}
      <div
        className="h-[env(safe-area-inset-bottom)]"
        style={{
          background: 'var(--color-bg-card)',
        }}
      />
    </nav>
  );
}
