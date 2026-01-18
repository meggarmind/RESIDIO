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
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { NotificationBell } from '@/components/notifications';
import { GlobalSearchCommand } from './global-search-command';
import { AdminBreadcrumb } from './admin-breadcrumb';
import { useAiAssistant } from '@/hooks/use-ai-assistant';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  LayoutGrid,
  ShieldCheck,
  Upload,
} from 'lucide-react';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile, signOut, residentId, isSigningOut, isLoading } = useAuth();
  const { isDismissed, restoreAssistant } = useAiAssistant();
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const pathname = usePathname();

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
            "flex h-16 items-center justify-between gap-4 px-4 md:px-6 transition-all duration-500 rounded-2xl border shadow-sm backdrop-blur-md bg-background/80",
            "hover:shadow-md hover:border-accent-primary/20"
          )}
        >
          {/* Left Section: Menu & Status */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden hover:bg-accent/50 transition-colors rounded-xl"
              onClick={onMenuClick}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/settings/system"
                    className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500/5 border border-emerald-500/10 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/20"
                  >
                    <div className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </div>
                    <span className="sr-only">System Status</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px] font-medium uppercase tracking-wider">
                  System Operational
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>


            {/* Page Title / Greeting */}
            <div className="hidden md:block ml-2">
              {pathname === '/dashboard' && mounted && profile ? (
                <h1 className="text-xl font-bold tracking-tight">
                  {getGreeting()}, {profile.full_name?.split(' ')[0] || 'there'}
                </h1>
              ) : pathname === '/dashboard' ? (
                <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
              ) : null}
            </div>

            <div className="hidden lg:block ml-2 overflow-hidden max-w-[200px] xl:max-w-none">
              <AdminBreadcrumb hideDashboard className="mb-0 whitespace-nowrap" />
            </div>
          </div>

          {/* Center Section: Search Bar */}
          <div className="flex-1 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={cn(
                "flex items-center gap-3 w-full rounded-xl border py-2 px-4 text-sm transition-all group",
                isSearchFocused
                  ? "bg-muted/90 ring-2 ring-accent-primary/20 border-accent-primary/50 shadow-sm"
                  : "bg-muted/50 border-muted-foreground/10 hover:bg-muted/70 hover:border-muted-foreground/20"
              )}
            >
              <Search className={cn(
                "h-4 w-4 transition-colors",
                isSearchFocused ? "text-accent-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              <span className="flex-1 text-left text-muted-foreground font-medium">Search</span>
            </button>
          </div>

          {/* Right Section: Action Group */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Quick Action */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl hover:bg-accent/50 transition-all hover:scale-105 active:scale-95 group"
                >
                  <div className="relative h-6 w-6">
                    {/* Three small squares of the layout grid */}
                    <div className="absolute bottom-0 left-0 w-2.5 h-2.5 rounded-[2px] border-2 border-muted-foreground transition-colors group-hover:border-foreground" />
                    <div className="absolute top-0 left-0 w-2.5 h-2.5 rounded-[2px] border-2 border-muted-foreground transition-colors group-hover:border-foreground" />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-[2px] border-2 border-muted-foreground transition-colors group-hover:border-foreground" />

                    {/* The prominent Plus icon in the top-right position */}
                    <div className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-background border border-orange-500 transition-all group-hover:bg-orange-50 group-hover:scale-110 shadow-[0_0_8px_rgba(249,115,22,0.1)]">
                      <Plus className="h-3 w-3 text-orange-500 stroke-[3px]" />
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent-primary" />
                  <span>Quick Actions</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/residents?action=create" className="cursor-pointer">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Resident
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/houses?action=create" className="cursor-pointer">
                    <Home className="mr-2 h-4 w-4" />
                    Add House
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/billing?action=create" className="cursor-pointer">
                    <Receipt className="mr-2 h-4 w-4" />
                    Create Invoice
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/payments/import" className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Import Statement
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/reports/new" className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    Generate Report
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/security?action=create" className="cursor-pointer">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Security Contact
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationBell />

            {mounted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-xl p-0 transition-all hover:bg-accent/50 hover:scale-105 active:scale-95">
                    <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                      <AvatarFallback className="bg-accent-primary text-white font-bold">
                        {isLoading || !profile?.full_name ? (
                          <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                        ) : (
                          profile.full_name.charAt(0)
                        )}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">{getGreeting()}</span>
                          <span className="text-sm font-semibold leading-none">{profile?.full_name}</span>
                        </div>
                        <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <p className="text-xs leading-none text-muted-foreground truncate">
                        {profile?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {residentId || profile?.role === 'super_administrator' || profile?.role === 'admin' ? (
                    <DropdownMenuItem asChild>
                      <Link href="/portal" className="cursor-pointer font-medium flex items-center w-full">
                        <User className="mr-2 h-4 w-4" />
                        <span>Resident Portal</span>
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="capitalize font-medium opacity-70">
                      <User className="mr-2 h-4 w-4" />
                      {profile?.role?.replace('_', ' ')}
                    </DropdownMenuItem>
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
            )}
          </div>
        </header>

        <GlobalSearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </>
  );
}
