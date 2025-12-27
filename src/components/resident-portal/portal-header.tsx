'use client';

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
import { LogOut, ChevronDown, LayoutDashboard } from 'lucide-react';

/**
 * Portal Header Component
 *
 * A refined, mobile-first header with:
 * - Estate branding on the left
 * - Resident name (truncated) in center
 * - Avatar dropdown on the right with sign out
 */
export function PortalHeader() {
  const { profile, signOut, hasAnyPermission } = useAuth();

  // Check if user has admin dashboard access (any admin permission indicates dashboard access)
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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background/80 backdrop-blur-xl border-b border-border/40">
      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-background to-transparent opacity-50 pointer-events-none" />

      <div className="relative h-full px-4 flex items-center justify-between max-w-lg mx-auto">
        {/* Logo / Branding */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-primary"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground/80 hidden sm:block">
            Residio
          </span>
        </div>

        {/* Center: Resident Name */}
        <div className="absolute left-1/2 -translate-x-1/2 max-w-[40%]">
          <span className="text-sm font-medium text-foreground truncate block text-center">
            {profile?.full_name || 'Resident'}
          </span>
        </div>

        {/* Right: Avatar Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 p-1 -m-1 rounded-full
                         hover:bg-accent/50 active:scale-95
                         transition-all duration-150 ease-out
                         focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 animate-in slide-in-from-top-1 fade-in-0 duration-200"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
                <p className="text-xs leading-none text-muted-foreground">{profile?.email}</p>
              </div>
            </DropdownMenuLabel>
            {hasAdminAccess && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Admin Dashboard
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
