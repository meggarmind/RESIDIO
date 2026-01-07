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
 * - Search bar with real-time suggestions
 * - Primary action button (Add Resident)
 * - Notification bell with badges
 * - User profile dropdown
 */
export function ModernHeader({ onMenuClick }: ModernHeaderProps) {
  const { profile, signOut, residentId, isSigningOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
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
    };

    return pageMap[segments[0]] || segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
  };

  return (
    <header className={cn(
      'sticky top-0 z-40 flex h-20 items-center gap-6 border-b px-6',
      // Modern theme: white background with subtle border
      'bg-white dark:bg-[#1E293B] border-gray-200 dark:border-[#334155]'
    )}>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Page Title - Desktop Only */}
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {getPageTitle(pathname)}
        </h1>
      </div>

      {/* Search Bar - Desktop */}
      <div className={cn(
        'hidden md:flex flex-1 max-w-md transition-all duration-200',
        searchFocused && 'max-w-lg'
      )}>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search residents, houses, payments..."
            className={cn(
              'w-full rounded-xl border bg-gray-50 py-2.5 pl-10 pr-4 text-sm',
              'placeholder:text-gray-400 focus:outline-none focus:ring-2',
              // Modern theme: blue-teal focus ring
              'border-gray-200 focus:border-[#0EA5E9] focus:ring-[#0EA5E9]/20',
              'dark:bg-[#0F172A] dark:border-[#334155] dark:text-white'
            )}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>
      </div>

      {/* Mobile Search Icon */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
      >
        <Search className="h-5 w-5" />
        <span className="sr-only">Search</span>
      </Button>

      {/* Spacer */}
      <div className="flex-1 md:hidden" />

      {/* Primary Action - Add Resident */}
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
              {profile?.role?.replace('_', ' ')}
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
    </header>
  );
}
