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
import { Menu, LogOut, User, Home, Search, UserPlus, Activity, Command, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminBreadcrumb } from './admin-breadcrumb';

interface ModernHeaderProps {
  onMenuClick?: () => void;
}

/**
 * Modern Header Component - Phase 2 (Enhanced)
 *
 * Features Modern theme design with:
 * - Floating bento-style layout
 * - Interactive expanding search
 * - System status indicator
 * - Dynamic page title based on route
 */
export function ModernHeader({ onMenuClick }: ModernHeaderProps) {
  const { profile, signOut, residentId, isSigningOut } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get greeting based on time of day
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Get page title from pathname
  const getPageTitle = (path: string): string => {
    const segments = path.split('/').filter(Boolean);

    // Debug logging
    if (segments.length === 0 || segments[0] === 'dashboard') {
      console.log('[ModernHeader] Dashboard detected:', {
        path,
        segments,
        mounted,
        hasProfile: !!profile,
        profileName: profile?.full_name
      });
    }

    // Show personalized greeting on dashboard (only when mounted and profile loaded)
    if ((segments.length === 0 || segments[0] === 'dashboard') && mounted && profile) {
      const firstName = profile.full_name?.split(' ')[0] || 'there';
      const greeting = `${getGreeting()}, ${firstName}`;
      console.log('[ModernHeader] Returning greeting:', greeting);
      return greeting;
    }

    // Fallback to "Dashboard" while loading
    if (segments.length === 0 || segments[0] === 'dashboard') {
      console.log('[ModernHeader] Returning fallback: Dashboard');
      return 'Dashboard';
    }

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
      <div className="sticky top-0 z-40 w-full px-4 pt-4">
        <header
          className={cn(
            "flex h-20 items-center gap-4 px-4 md:px-6 transition-all duration-500 rounded-2xl border shadow-sm backdrop-blur-md bg-background/80",
            "hover:shadow-md hover:border-accent-primary/20"
          )}
        >
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
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {getPageTitle(pathname)}
            </h1>
            <AdminBreadcrumb hideDashboard className="mb-0 text-[10px] -mt-1 opacity-60" />
          </div>

          {/* System Status Indicator */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 transition-all hover:bg-primary/10 select-none">
            <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Session Active</span>
          </div>

          {/* Search Bar - Desktop (clicks to open command palette) */}
          <div
            className={cn(
              "hidden md:flex items-center transition-all duration-300 ease-in-out",
              isSearchFocused ? "flex-[2] max-w-lg" : "flex-1 max-w-md"
            )}
          >
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={cn(
                "flex items-center gap-3 w-full rounded-xl border py-2.5 px-4 text-sm transition-all group",
                isSearchFocused
                  ? "bg-muted ring-2 ring-accent-primary/20 border-accent-primary/50"
                  : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-muted-foreground/20 text-left"
              )}
            >
              <Search className={cn(
                "h-5 w-5 transition-colors",
                isSearchFocused ? "text-accent-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              <span className="flex-1 text-muted-foreground">Search anywhere...</span>
              <kbd className="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm">
                <Command className="h-2.5 w-2.5" />
                <span>K</span>
              </kbd>
            </button>
          </div>

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
            {/* Quick Action Dropdown - Desktop */}
            <div className="hidden sm:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-2 rounded-xl shadow-sm hover:translate-y-[-1px] transition-all bg-accent-primary hover:bg-accent-hover text-white px-4 py-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Quick Action</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-xl overflow-hidden p-1 shadow-lg ring-1 ring-black/5">
                  <DropdownMenuLabel className="text-xs font-semibold py-2 px-3 opacity-50 uppercase tracking-wider">Workspace Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem asChild>
                    <Link href="/residents?action=create" className="cursor-pointer flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-accent group">
                      <UserPlus className="h-4 w-4 text-muted-foreground group-hover:text-accent-primary transition-colors" />
                      <span>Add Resident</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/billing?action=create" className="cursor-pointer flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-accent group">
                      <Receipt className="h-4 w-4 text-muted-foreground group-hover:text-accent-primary transition-colors" />
                      <span>Create Invoice</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/reports/new" className="cursor-pointer flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-accent group">
                      <FileText className="h-4 w-4 text-muted-foreground group-hover:text-accent-primary transition-colors" />
                      <span>Generate Report</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile Add Button - Icon Only */}
            <Button
              asChild
              size="icon"
              className="md:hidden rounded-xl bg-accent-primary hover:bg-accent-hover text-white"
            >
              <Link href="/residents?action=create">
                <Sparkles className="h-4 w-4" />
                <span className="sr-only">Quick Action</span>
              </Link>
            </Button>

            {/* Spacer to push user items to extreme right */}
            <div className="hidden md:block w-2 lg:w-4" />

            {/* Notification Bell */}
            {mounted && <NotificationBell />}

            {/* User Profile Dropdown */}
            {mounted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback
                        className="font-semibold"
                        style={{
                          backgroundColor: 'var(--accent-primary)',
                          color: 'var(--text-on-accent)',
                        }}
                      >
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
      </div>
    </>
  );
}
