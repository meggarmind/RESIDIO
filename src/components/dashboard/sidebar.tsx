'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { User, UserSearch, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
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

  // Expandable submenu state
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  // Check if any child is active
  const hasActiveChild = (children?: { href: string }[]) => {
    if (!children) return false;
    return children.some(
      (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
    );
  };

  // Toggle submenu expansion
  const toggleSubmenu = (menuId: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) {
        next.delete(menuId);
      } else {
        next.add(menuId);
      }
      return next;
    });
  };

  // Auto-expand sub-menus containing active children on load/pathname change
  useEffect(() => {
    sections.forEach(section => {
      section.items.forEach(item => {
        if (item.children && hasActiveChild(item.children)) {
          setExpandedMenus(prev => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
          });
        }
      });
    });
  }, [pathname, sections]);

  return (
    <aside
      className={cn(
        'flex flex-col border-r transition-all duration-300 ease-in-out',
        isExpanded ? 'w-64' : 'w-16',
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
              {isExpanded && <span className="text-xl font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>Residio</span>}
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
                  className="px-3 py-2 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
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
                  const isActive = pathname === item.href;
                  const hasChildren = item.children && item.children.length > 0;
                  const isParentOfActive = hasActiveChild(item.children);
                  const isMenuExpanded = expandedMenus.has(item.id) || isParentOfActive;
                  const showBadgeCount = item.showBadge && typeof pendingCount === 'number' && pendingCount > 0;

                  const navLink = (
                    <div
                      className={cn(
                        'flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative group',
                        isExpanded ? 'gap-3 px-3 py-2' : 'justify-center px-2 py-2',
                        (isActive || isParentOfActive) && [
                          'bg-primary/10 text-primary shadow-sm inner-border',
                          'before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-r-full before:bg-primary'
                        ]
                      )}
                      onMouseEnter={(e) => {
                        if (!isActive && !isParentOfActive) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive && !isParentOfActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                      }}
                    >


                      <item.icon className={cn('h-4 w-4 flex-shrink-0', (isActive || isParentOfActive) ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      {isExpanded && (
                        <>
                          <span className="flex-1 truncate whitespace-nowrap">{item.title}</span>
                          {showBadgeCount && (
                            <Badge
                              variant="destructive"
                              className="h-5 min-w-[20px] px-1.5 text-xs"
                            >
                              {pendingCount}
                            </Badge>
                          )}
                          {hasChildren && (
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 transition-transform duration-200 opacity-60 group-hover:opacity-100',
                                isMenuExpanded && 'rotate-180'
                              )}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {isCollapsed && !isExpanded ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={item.href}>{navLink}</Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{item.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : hasChildren ? (
                        <button
                          onClick={() => toggleSubmenu(item.id)}
                          className="w-full text-left"
                        >
                          {navLink}
                        </button>
                      ) : (
                        <Link href={item.href}>{navLink}</Link>
                      )}

                      {/* Render nested children with accordion behavior - only when expanded */}
                      {hasChildren && isExpanded && (
                        <div
                          className={cn(
                            'overflow-hidden transition-all duration-300 ease-in-out',
                            isMenuExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0'
                          )}
                        >
                          <ul className="relative ml-5 border-l space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
                            {item.children!.map((child) => {
                              const isChildActive = pathname === child.href;
                              return (
                                <li key={child.id} className="relative">
                                  <Link
                                    href={child.href}
                                    className="flex items-center gap-3 rounded-lg px-3 py-1.5 pl-4 text-sm font-medium transition-all duration-200"
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
                                    <child.icon className="h-3.5 w-3.5" />
                                    <span className="flex-1 truncate whitespace-nowrap">{child.title}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
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
                <span className="whitespace-nowrap">My Portal</span>
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
                <span className="whitespace-nowrap">View as Resident</span>
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
            <Link
              href="/profile" // Assuming a profile page exists
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50' // Added hover styles
              )}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium flex-shrink-0"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              >
                {profile?.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                  {profile?.full_name}
                </p>
                <p className="text-xs truncate whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  {profile?.role_display_name || profile?.role?.replace('_', ' ')}
                </p>
              </div>
            </Link>
          )}
        </TooltipProvider>
      </div>
    </aside>
  );
}
