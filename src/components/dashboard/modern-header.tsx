'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/notifications';
import { GlobalSearchCommand } from './global-search-command';
import { Menu, LogOut, User, Home, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModernHeaderProps {
  onMenuClick?: () => void;
}

/**
 * Modern Header Component
 *
 * Features Modern theme design with:
 * - White/light background (dark mode adaptive)
 * - Dynamic page title based on route
 * - Global search with command palette (⌘K)
 * - Primary action button (Add Resident)
 * - Notification bell with badges
 * - User profile dropdown
 * - Mobile responsive with hamburger menu
 */
export function ModernHeader({ onMenuClick }: ModernHeaderProps) {
  const { profile, signOut, residentId, isSigningOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get page title from pathname
  const getPageTitle = (path: string): string => {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0 || segments[0] === 'dashboard') return 'Dashboard';

    const pageMap: Record<string, string> = {
      analytics: 'Analytics',
      residents: 'Residents',
      houses: 'Houses',
      payments: 'Payments',
      billing: 'Billing',
      security: 'Security',
      reports: 'Reports',
      documents: 'Documents',
      announcements: 'Announcements',
      approvals: 'Approvals',
      settings: 'Settings',
      portal: 'Portal',
      notifications: 'Notifications',
    };

    return pageMap[segments[0]] || segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
  };

  return (
    <>
      <header className={cn(
        'sticky top-0 z-40 flex h-20 items-center gap-4 border-b px-4 md:px-6',
        // Modern theme: white background with subtle border
        'bg-white dark:bg-[#1E293B] border-gray-200 dark:border-[#334155]'
      )}>
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden rounded-xl"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>

        {/* Page Title - Desktop Only */}
        <div className="hidden md:block min-w-[120px]">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {getPageTitle(pathname)}
          </h1>
        </div>

        {/* Search Bar - Desktop (clicks to open command palette) */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(
            'hidden md:flex items-center gap-3 w-full max-w-md',
            'rounded-xl border bg-gray-50 py-2.5 px-4 text-sm',
            'border-gray-200 hover:border-gray-300 hover:bg-gray-100',
            'dark:bg-[#0F172A] dark:border-[#334155] dark:hover:border-[#475569]',
            'transition-colors cursor-pointer text-left'
          )}
        >
          <Search className="h-5 w-5 text-gray-400" />
          <span className="text-gray-400 flex-1">Quick Search...</span>
          <kbd className="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-white dark:bg-[#1E293B] px-1.5 font-mono text-[10px] font-medium text-gray-400">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>

        {/* Mobile Search Icon */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden rounded-xl"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </Button>

        {/* Spacer - pushes action items to the right */}
        <div className="flex-1" />

        {/* Right-aligned Action Items Group */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Primary Action - Add Resident (Desktop Only) */}
          <Button
            asChild
            className={cn(
              'hidden md:flex gap-2 rounded-xl font-medium shadow-sm',
              // Modern theme: blue-teal primary button
              'bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
            )}
          >
            <Link href="/residents?action=create">
              <UserPlus className="h-4 w-4" />
              Add Resident
            </Link>
          </Button>

          {/* Mobile Add Button - Icon Only */}
          <Button
            asChild
            size="icon"
            className={cn(
              'md:hidden rounded-xl',
              'bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
            )}
          >
            <Link href="/residents?action=create">
              <UserPlus className="h-4 w-4" />
              <span className="sr-only">Add Resident</span>
            </Link>
          </Button>

          {/* Notification Bell */}
          {mounted && <NotificationBell />}

          {/* User Profile Dropdown */}
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={cn(
                      'font-semibold',
                      // Modern theme: blue-teal avatar background
                      'bg-[#0EA5E9] text-white'
                    )}>
                      {profile?.full_name?.charAt(0) || '?'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {profile?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="capitalize">
                  <User className="mr-2 h-4 w-4" />
                  {profile?.role_display_name || profile?.role?.replace('_', ' ')}
                </DropdownMenuItem>
                {residentId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/portal">
                        <Home className="mr-2 h-4 w-4" />
                        Resident Portal
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={signOut}
                  disabled={isSigningOut}
                  className="text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isSigningOut ? 'Signing out...' : 'Sign out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Global Search Command Palette */}
      <GlobalSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
