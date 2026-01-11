'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { User, UserSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePendingApprovalsCount } from '@/hooks/use-approvals';
import { Badge } from '@/components/ui/badge';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useSectionedNavigation } from '@/hooks/use-navigation';
import { useEstateLogo } from '@/hooks/use-estate-logo';
import { useSidebarState } from '@/hooks/use-sidebar-state';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, hasPermission, residentId } = useAuth();
  const { sections } = useSectionedNavigation();
  const { data: pendingCount } = usePendingApprovalsCount();
  const { logoUrl } = useEstateLogo();
  const { isCollapsed, isExpanded, toggleCollapsed, setHoverExpanded } = useSidebarState();

  return (
    <aside
      className={cn(
        'flex flex-col border-r transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
      }}
      onMouseEnter={() => isCollapsed && setHoverExpanded(true)}
      onMouseLeave={() => isCollapsed && setHoverExpanded(false)}
    >
      {/* Header with Logo/Brand */}
      <div className={cn('p-6 flex items-center', isCollapsed && !isExpanded && 'justify-center')}>
        <Link href="/dashboard" className="flex items-center gap-2">
          {logoUrl && isExpanded ? (
            <img
              src={logoUrl}
              alt="Estate Logo"
              className="h-8 w-auto max-w-[140px] object-contain transition-opacity duration-300"
            />
          ) : (
            <>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--text-on-accent)',
                }}
              >
                R
              </div>
              {isExpanded && <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Residio</span>}
            </>
          )}
        </Link>

        {/* Toggle Button - Always visible on desktop */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            'ml-auto p-1 rounded-lg transition-colors',
            isCollapsed && !isExpanded && 'hidden'
          )}
          style={{
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className={cn('flex-1 pb-4 space-y-4', isExpanded ? 'px-4' : 'px-2')}>
        <TooltipProvider delayDuration={0}>
          {sections.map((section, sectionIndex) => (
            <div key={section.id}>
              {/* Section header - only show when expanded */}
              {section.label && isExpanded && (
                <h3
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {section.label}
                </h3>
              )}
              {/* Section separator (except for first section) - only show when expanded */}
              {!section.label && sectionIndex > 0 && isExpanded && (
                <div className="h-px my-2" style={{ backgroundColor: 'var(--border-subtle)' }} />
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const showBadgeCount = item.showBadge && pendingCount && pendingCount > 0;

                  const navLink = (
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center rounded-lg text-sm font-medium transition-all duration-200',
                        isExpanded ? 'gap-3 px-3 py-2' : 'justify-center px-2 py-2'
                      )}
                      style={{
                        backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                        color: isActive ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                      }}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {isExpanded && (
                        <>
                          <span className="flex-1 truncate">{item.title}</span>
                          {showBadgeCount && (
                            <Badge
                              variant="destructive"
                              className="h-5 min-w-[20px] px-1.5 text-xs"
                            >
                              {pendingCount}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.id}>
                      {isCollapsed && !isExpanded ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{item.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        navLink
                      )}

                      {/* Render nested children with indent - only when expanded */}
                      {item.children && item.children.length > 0 && isExpanded && (
                        <ul className="mt-1 space-y-1">
                          {item.children.map((child) => {
                            const isChildActive =
                              pathname === child.href || pathname.startsWith(`${child.href}/`);
                            return (
                              <li key={child.id}>
                                <Link
                                  href={child.href}
                                  className="flex items-center gap-3 rounded-lg px-3 py-2 pl-9 text-sm font-medium transition-all duration-200"
                                  style={{
                                    backgroundColor: isChildActive
                                      ? 'var(--accent-primary)'
                                      : 'transparent',
                                    color: isChildActive
                                      ? 'var(--text-on-accent)'
                                      : 'var(--text-secondary)',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isChildActive) {
                                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                                      e.currentTarget.style.color = 'var(--text-primary)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isChildActive) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                      e.currentTarget.style.color = 'var(--text-secondary)';
                                    }
                                  }}
                                >
                                  <child.icon className="h-4 w-4" />
                                  <span className="flex-1 truncate">{child.title}</span>
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
            </div>
          ))}
        </TooltipProvider>
      </nav>
      <div
        className="p-4 space-y-3"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        <TooltipProvider delayDuration={0}>
          {/* Theme Switcher - only show when expanded */}
          {isExpanded && <ThemeSwitcher />}

          {/* View as Resident link - only shown if user has a resident_id */}
          {residentId && (
            isCollapsed && !isExpanded ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/portal"
                    className={cn(
                      'flex items-center rounded-lg text-sm transition-all duration-200',
                      isExpanded ? 'gap-3 px-3 py-2' : 'justify-center px-2 py-2'
                    )}
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <User className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>My Portal</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/portal"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <User className="h-4 w-4" />
                <span>My Portal</span>
              </Link>
            )
          )}

          {/* Impersonate Resident link - only for admins with impersonation permission */}
          {hasPermission(PERMISSIONS.IMPERSONATION_START_SESSION) && (
            isCollapsed && !isExpanded ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => router.push('/portal?impersonate=true')}
                    className={cn(
                      'flex items-center rounded-lg text-sm transition-all duration-200 w-full cursor-pointer',
                      isExpanded ? 'gap-3 px-3 py-2 text-left' : 'justify-center px-2 py-2'
                    )}
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <UserSearch className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>View as Resident</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/portal?impersonate=true')}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 w-full text-left cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <UserSearch className="h-4 w-4" />
                <span>View as Resident</span>
              </button>
            )
          )}

          {/* User Profile Section */}
          {isCollapsed && !isExpanded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center px-2 py-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {profile?.full_name?.charAt(0) || '?'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{profile?.full_name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {profile?.role_display_name || profile?.role?.replace('_', ' ')}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              >
                {profile?.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {profile?.full_name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {profile?.role_display_name || profile?.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}
        </TooltipProvider>
      </div>
    </aside>
  );
}
