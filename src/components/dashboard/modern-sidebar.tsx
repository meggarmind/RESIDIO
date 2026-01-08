'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { User, UserSearch } from 'lucide-react';
import { usePendingApprovalsCount } from '@/hooks/use-approvals';
import { Badge } from '@/components/ui/badge';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useNavigation } from '@/hooks/use-navigation';

interface ModernSidebarProps {
  className?: string;
}

/**
 * Modern Sidebar Component
 *
 * Features dark navy background (#1E293B) and Modern theme design tokens:
 * - Generous spacing (1.5rem-2rem)
 * - Softer border radius (12px)
 * - Enhanced shadows for depth
 * - Blue-teal accent colors
 *
 * Uses shared navigation config from src/config/navigation.ts
 */
export function ModernSidebar({ className }: ModernSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, hasPermission, residentId } = useAuth();
  const { navItems: filteredNavItems } = useNavigation();
  const { data: pendingCount } = usePendingApprovalsCount();

  return (
    <aside
      className={cn(
        'flex flex-col w-[280px] border-r',
        // Modern theme: dark navy background
        'bg-[#1E293B] dark:bg-[#0F172A] text-white',
        className
      )}
    >
      {/* Logo Section */}
      <div className="p-8">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0EA5E9] text-white shadow-lg">
            <span className="text-lg font-bold">R</span>
          </div>
          <span className="text-2xl font-bold">Residio</span>
        </Link>
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 px-6 pb-6">
        <ul className="space-y-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showBadgeCount = item.showBadge && pendingCount && pendingCount > 0;

            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    // Modern theme: generous padding, rounded corners
                    'flex items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-[#0EA5E9] text-white shadow-md'
                      : 'text-gray-300 hover:bg-[#334155] hover:text-white'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="flex-1">{item.title}</span>
                  {showBadgeCount && (
                    <Badge
                      variant="destructive"
                      className="h-6 min-w-[24px] px-2 text-xs font-semibold rounded-lg"
                    >
                      {pendingCount}
                    </Badge>
                  )}
                </Link>

                {/* Nested children with indent */}
                {item.children && item.children.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {item.children.map((child) => {
                      const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            className={cn(
                              'flex items-center gap-4 rounded-xl px-4 py-2.5 pl-12 text-sm font-medium transition-all duration-200',
                              isChildActive
                                ? 'bg-[#0EA5E9] text-white shadow-md'
                                : 'text-gray-300 hover:bg-[#334155] hover:text-white'
                            )}
                          >
                            <child.icon className="h-4 w-4" />
                            <span className="flex-1">{child.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer Section */}
      <div className="border-t border-[#334155] p-6 space-y-4">
        <ThemeSwitcher />

        {/* View as Resident link */}
        {residentId && (
          <Link
            href="/portal"
            className="flex items-center gap-4 rounded-xl px-4 py-3 text-sm text-gray-300 hover:bg-[#334155] hover:text-white transition-all duration-200"
          >
            <User className="h-5 w-5" />
            <span>My Portal</span>
          </Link>
        )}

        {/* Impersonate Resident link */}
        {hasPermission(PERMISSIONS.IMPERSONATION_START_SESSION) && (
          <button
            type="button"
            onClick={() => router.push('/portal?impersonate=true')}
            className="flex items-center gap-4 rounded-xl px-4 py-3 text-sm text-gray-300 hover:bg-[#334155] hover:text-white transition-all duration-200 w-full text-left cursor-pointer"
          >
            <UserSearch className="h-5 w-5" />
            <span>View as Resident</span>
          </button>
        )}

        {/* User Profile */}
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#334155]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0EA5E9] text-white text-sm font-semibold">
            {profile?.full_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-semibold truncate text-white">{profile?.full_name}</p>
            <p className="text-xs text-gray-400">
              {profile?.role_display_name || profile?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
