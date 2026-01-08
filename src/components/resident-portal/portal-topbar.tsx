'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

import { Search, Bell, Sun, Moon, Monitor, LogOut, Shield, Users, LayoutDashboard } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useImpersonation } from '@/hooks/use-impersonation';
import { useRouter } from 'next/navigation';

export function PortalTopBar({ title }: { title?: string }) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const { residentId, signOut, profile, hasPermission, isSigningOut } = useAuth();
    const { data: resident } = useResident(residentId || undefined);
    const { canImpersonate, isImpersonating } = useImpersonation();

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent hydration mismatch by not rendering theme logic until mounted
    if (!mounted) {
        return <header className="h-16 flex items-center justify-between px-6 bg-transparent" />
    }

    return (
        <header className="h-16 flex items-center justify-between px-6 bg-transparent">
            {/* Search */}
            <div className="relative w-[300px]">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="h-[18px] w-[18px] text-bill-text-secondary" />
                </div>
                <input
                    type="text"
                    placeholder="Search here"
                    className="w-full h-10 bg-bill-card border border-border rounded-lg pl-10 pr-4 text-sm text-bill-text placeholder:text-bill-text-secondary focus:outline-none focus:ring-1 focus:ring-bill-text"
                />
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-4">
                {/* Theme Switcher Segmented Control */}
                <div className="flex bg-bill-secondary p-1 rounded-lg h-9">
                    <button
                        onClick={() => setTheme('light')}
                        className={cn("p-1 rounded flex items-center justify-center w-8 h-full transition-all", theme === 'light' ? "bg-bill-card shadow-sm text-bill-text" : "text-bill-text-secondary")}
                    >
                        <Sun className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setTheme('dark')}
                        className={cn("p-1 rounded flex items-center justify-center w-8 h-full transition-all", theme === 'dark' ? "bg-bill-card shadow-sm text-bill-text" : "text-bill-text-secondary")}
                    >
                        <Moon className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setTheme('system')}
                        className={cn("p-1 rounded flex items-center justify-center w-8 h-full transition-all", theme === 'system' ? "bg-bill-card shadow-sm text-bill-text" : "text-bill-text-secondary")}
                    >
                        <Monitor className="h-4 w-4" />
                    </button>
                </div>

                {/* View as Resident - Only for admins who can impersonate */}
                {canImpersonate && !isImpersonating && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/portal?impersonate=true')}
                        className="text-bill-text-secondary hover:text-bill-text hover:bg-bill-secondary gap-2"
                    >
                        <Users className="h-4 w-4" />
                        <span className="hidden md:inline">View as...</span>
                    </Button>
                )}

                {/* Return to Admin Dashboard - Only for admins, not during impersonation */}
                {canImpersonate && !isImpersonating && (
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="gap-2 border-border"
                    >
                        <Link href="/dashboard">
                            <LayoutDashboard className="h-4 w-4" />
                            <span className="hidden sm:inline">Admin</span>
                        </Link>
                    </Button>
                )}

                {/* Notification */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-bill-text-secondary hover:text-bill-text hover:bg-bill-secondary rounded-full"
                    aria-label="Notifications"
                >
                    <Bell className="h-[18px] w-[18px]" />
                </Button>

                {/* Profile Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-3 pl-2 border-l border-border hover:opacity-80 transition-opacity cursor-pointer">
                            <Avatar className="h-9 w-9 border border-border">
                                <AvatarImage src={resident?.photo_url || undefined} alt={resident?.first_name || 'Resident'} />
                                <AvatarFallback className="bg-bill-mint text-bill-text font-medium text-xs">
                                    {resident?.first_name?.charAt(0)?.toUpperCase() || ''}
                                    {resident?.last_name?.charAt(0)?.toUpperCase() || ''}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium text-bill-text hidden md:block">
                                {resident?.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : 'Resident'}
                            </span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 bg-bill-card border-border" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none text-bill-text">
                                    {resident?.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : 'Resident'}
                                </p>
                                <p className="text-xs leading-none text-bill-text-secondary">
                                    {resident?.email}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-border" />

                        {/* Admin Dashboard Link - Only show for admin users */}
                        {(profile?.role_name === 'super_admin' || profile?.role_name === 'chairman' || profile?.role === 'chairman' || profile?.role === 'admin') && (
                            <>
                                <DropdownMenuItem asChild>
                                    <Link href="/dashboard" className="cursor-pointer text-bill-text hover:bg-bill-secondary">
                                        <Shield className="mr-2 h-4 w-4" />
                                        Admin Dashboard
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-border" />
                            </>
                        )}

                        <DropdownMenuItem
                            onSelect={signOut}
                            disabled={isSigningOut}
                            className="text-destructive hover:bg-bill-secondary cursor-pointer"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            {isSigningOut ? 'Signing out...' : 'Sign out'}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
