'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, ChevronDown, LayoutDashboard, Search } from 'lucide-react';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { InvoiceStatusIndicator } from './invoice-status-indicator';
import { QuickActionsMenu } from './quick-actions-menu';

/**
 * Portal Header - Modern Design System
 *
 * Clean, minimalist header (64px height) following the portal-modern design system.
 *
 * Layout Structure:
 * Desktop:
 * - Left: Greeting ("Hello {Name}, Good Morning")
 * - Center: Search bar (pill-shaped, 400px max-width)
 * - Right: Icon buttons (Mail, Bell) + Avatar dropdown
 *
 * Mobile:
 * - Left: Greeting (name only, truncated)
 * - Right: Search icon + Avatar dropdown
 *
 * Design Specifications:
 * - Height: 64px (var(--header-height))
 * - Background: White card (var(--color-bg-card))
 * - Border bottom: 1px subtle gray
 * - Search bar: Pill-shaped, light gray background
 * - Icons: 20px size
 * - Avatar: 40px with 2px white ring
 *
 * Features:
 * - Time-based greeting (Morning/Afternoon/Evening)
 * - Global search (hidden on mobile, icon button)
 * - Notification indicators
 * - Admin access link (if applicable)
 * - Theme switcher in dropdown
 */
export function PortalHeader() {
  const { profile, signOut, hasAnyPermission, isSigningOut } = useAuth();

  // Check if user has admin dashboard access
  const hasAdminAccess = hasAnyPermission([PERMISSIONS.RESIDENTS_VIEW]);

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const initials = profile?.full_name ? getInitials(profile.full_name) : 'R';

  // Get first name for greeting
  const firstName = profile?.full_name?.split(' ')[0] || 'Resident';

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  return (
    <header
      className="sticky top-0 z-40 w-full transition-colors duration-300"
      style={{
        height: 'var(--header-height)', // 64px
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Left: Greeting */}
        <div className="flex-shrink-0 min-w-0">
          <h1
            className="font-semibold truncate"
            style={{
              fontSize: '1.25rem', // 20px
              color: 'var(--foreground)',
              lineHeight: '1.75rem',
            }}
          >
            <span className="hidden md:inline">Hello {firstName}, </span>
            <span
              className="hidden lg:inline"
              style={{
                color: 'var(--muted-foreground)',
                fontWeight: '400',
              }}
            >
              {greeting}
            </span>
            <span className="md:hidden">Hi {firstName}</span>
          </h1>
        </div>

        {/* Center: Search Bar (Desktop only) */}
        <div className="hidden md:flex flex-1 max-w-md mx-auto">
          <div className="search-input-wrapper w-full">
            <Search className="search-icon" />
            <input
              type="search"
              placeholder="Quick Search..."
              className="search-input"
              style={{
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>

        {/* Right: Actions & Avatar */}
        <div className="flex items-center gap-2">
          {/* Search Icon (Mobile only) */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius)',
            }}
          >
            <Search
              style={{
                width: '1.25rem',
                height: '1.25rem',
                color: 'var(--muted-foreground)',
              }}
            />
          </Button>

          {/* Quick Actions Menu (Desktop only) */}
          <QuickActionsMenu />

          {/* Invoice Status Indicator (Desktop only) */}
          <InvoiceStatusIndicator />

          {/* Notification Bell */}
          <NotificationBell />

          {/* Divider (Desktop only) */}
          <div
            className="hidden lg:block h-6 w-px mx-2"
            style={{
              background: 'var(--border)',
            }}
          />

          {/* Theme Switcher (Desktop only) */}
          <div className="hidden lg:block">
            <ThemeSwitcher variant="compact" />
          </div>

          {/* Avatar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 transition-all duration-150 hover:opacity-80"
                style={{
                  minWidth: '44px',
                  minHeight: '44px',
                  borderRadius: '9999px',
                }}
              >
                <Avatar
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '2px solid var(--card)',
                    boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                  }}
                >
                  <AvatarFallback
                    style={{
                      background: 'var(--primary)',
                      color: 'var(--primary-foreground)',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                    }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown
                  className="hidden md:block"
                  style={{
                    width: '16px',
                    height: '16px',
                    color: 'var(--muted-foreground)',
                  }}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              style={{
                borderRadius: 'var(--radius)',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
              }}
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'var(--foreground)',
                    }}
                  >
                    {profile?.full_name}
                  </p>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {profile?.email}
                  </p>
                </div>
              </DropdownMenuLabel>

              {/* Theme Switcher (Mobile) */}
              <div className="lg:hidden px-2 py-1.5">
                <ThemeSwitcher variant="compact" />
              </div>

              {hasAdminAccess && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Admin Dashboard
                    </Link>
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={signOut}
                disabled={isSigningOut}
                className="cursor-pointer"
                style={{
                  color: 'var(--destructive)',
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
