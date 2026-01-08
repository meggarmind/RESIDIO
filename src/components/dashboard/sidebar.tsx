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

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, hasPermission, residentId } = useAuth();
  const { navItems: filteredNavItems } = useNavigation();
  const { data: pendingCount } = usePendingApprovalsCount();

  return (
    <aside className={cn('flex flex-col w-64 border-r bg-card', className)}>
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            R
          </div>
          <span className="text-xl font-bold">Residio</span>
        </Link>
      </div>
      <nav className="flex-1 px-4 pb-4">
        <ul className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showBadgeCount = item.showBadge && pendingCount && pendingCount > 0;

            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.title}</span>
                  {showBadgeCount && (
                    <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                      {pendingCount}
                    </Badge>
                  )}
                </Link>
                {/* Render nested children with indent */}
                {item.children && item.children.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {item.children.map((child) => {
                      const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 pl-9 text-sm font-medium transition-colors',
                              isChildActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
      <div className="border-t p-4 space-y-3">
        <ThemeSwitcher />
        {/* View as Resident link - only shown if user has a resident_id */}
        {residentId && (
          <Link
            href="/portal"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <User className="h-4 w-4" />
            <span>My Portal</span>
          </Link>
        )}
        {/* Impersonate Resident link - only for admins with impersonation permission */}
        {hasPermission(PERMISSIONS.IMPERSONATION_START_SESSION) && (
          <button
            type="button"
            onClick={() => router.push('/portal?impersonate=true')}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full text-left cursor-pointer"
          >
            <UserSearch className="h-4 w-4" />
            <span>View as Resident</span>
          </button>
        )}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {profile?.full_name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium truncate">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">
              {profile?.role_display_name || profile?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
