'use client';

import { useState, useEffect } from 'react';
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
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { NotificationBell } from '@/components/notifications';
import { GlobalSearchCommand } from './global-search-command';
import { AdminBreadcrumb } from './admin-breadcrumb';
import { useAiAssistant } from '@/hooks/use-ai-assistant';
import { cn } from '@/lib/utils';
import {
  Menu,
  LogOut,
  User,
  Home,
  Search,
  Plus,
  UserPlus,
  Receipt,
  FileText,
  BadgeCheck,
  Sparkles,
  Activity,
  Command,
} from 'lucide-react';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile, signOut, residentId, isSigningOut } = useAuth();
  const { isDismissed, restoreAssistant } = useAiAssistant();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Simple greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <>
      <div className="sticky top-0 z-40 w-full px-4 pt-4">
        <header
          className={cn(
            "flex h-16 items-center gap-4 px-4 md:px-6 transition-all duration-500 rounded-2xl border shadow-sm backdrop-blur-md bg-background/80",
            "hover:shadow-md hover:border-accent-primary/20"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden hover:bg-accent/50 transition-colors rounded-xl"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>

          {/* System Status - Mini Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 transition-all hover:bg-emerald-500/10">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">System Operational</span>
          </div>

          {/* Global Search Trigger - Desktop */}
          <div
            className={cn(
              "hidden md:flex items-center transition-all duration-300 ease-in-out",
              isSearchFocused ? "flex-[2] max-w-lg" : "flex-1 max-w-sm"
            )}
          >
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={cn(
                "flex items-center gap-3 w-full rounded-xl border py-1.5 px-4 text-sm transition-all group",
                isSearchFocused
                  ? "bg-muted ring-2 ring-accent-primary/20 border-accent-primary/50"
                  : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-muted-foreground/20"
              )}
            >
              <Search className={cn(
                "h-4 w-4 transition-colors",
                isSearchFocused ? "text-accent-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              <span className="flex-1 text-left text-muted-foreground">Search workspace...</span>
              <div className="flex items-center gap-1.5">
                <kbd className="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm">
                  <Command className="h-2.5 w-2.5" />
                  <span>K</span>
                </kbd>
              </div>
            </button>
          </div>

          {/* Breadcrumbs - Integrated next to search on desktop */}
          <div className="hidden lg:block ml-2 overflow-hidden max-w-[200px] xl:max-w-none">
            <AdminBreadcrumb hideDashboard className="mb-0 whitespace-nowrap" />
          </div>

          {/* Spacer - ensures center/right distribution */}
          <div className="flex-1" />

          <div className="flex items-center gap-2 md:gap-4">
            {/* Quick Action Dropdown */}
            <div className="hidden sm:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-2 rounded-full shadow-sm hover:translate-y-[-1px] transition-all bg-accent-primary hover:bg-accent-hover text-white">
                    <Sparkles className="h-4 w-4" />
                    <span>Quick Action</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Create New</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/residents?action=create" className="cursor-pointer">
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add Resident
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/billing?action=create" className="cursor-pointer">
                      <Receipt className="mr-2 h-4 w-4" />
                      Create Invoice
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/reports/new" className="cursor-pointer">
                      <FileText className="mr-2 h-4 w-4" />
                      Generate Report
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <ThemeSwitcher variant="compact" className="md:hidden" />
          </div>

          {/* Extra spacer to push user items to extreme right */}
          <div className="hidden md:block flex-1 max-w-[40px] lg:max-w-none" />

          <div className="flex items-center gap-2 md:gap-4 ml-auto">
            {mounted && (
              <div className="flex items-center gap-2 md:gap-4">
                <NotificationBell />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 md:h-12 md:w-auto md:rounded-full md:px-2 md:py-0 transition-all hover:bg-accent/50">
                      <div className="flex items-center gap-3">
                        <div className="hidden md:flex flex-col items-end text-right">
                          <span className="text-xs text-muted-foreground leading-none mb-1">
                            {getGreeting()},
                          </span>
                          <span className="text-sm font-semibold leading-none">
                            {profile?.full_name?.split(' ')[0]}
                          </span>
                        </div>
                        <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                          <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                            {profile?.full_name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold leading-none">{profile?.full_name}</p>
                          <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
                        </div>
                        <p className="text-xs leading-none text-muted-foreground truncate">
                          {profile?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="capitalize font-medium">
                      <User className="mr-2 h-4 w-4" />
                      {profile?.role?.replace('_', ' ')}
                    </DropdownMenuItem>
                    {residentId && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/portal" className="cursor-pointer">
                            <Home className="mr-2 h-4 w-4" />
                            Resident Portal
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {isDismissed && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={restoreAssistant}
                          className="cursor-pointer text-accent-primary"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Show AI Assistant
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
              </div>
            )}
          </div>
        </header>

        <GlobalSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </>
  );
}
