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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ModernSidebarProps {
  className?: string;
}

/**
 * Modern Sidebar Component
 *
 * Features:
 * - Dark navy background (#1E293B) with Modern theme design tokens
 * - Collapsible: 260px expanded, 76px collapsed
 * - Smooth animations for expand/collapse transitions
 * - Tooltips when collapsed
 * - Expandable submenus with arrow icons
 * - Teal accent left border for active items
 * - Generous spacing (1.5rem-2rem), softer border radius (12px)
 * - Blue-teal accent colors (#0EA5E9)
 *
 * Uses shared navigation config from src/config/navigation.ts
 */
export function ModernSidebar({ className }: ModernSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, hasPermission, residentId } = useAuth();
  const { sections } = useSectionedNavigation();
  const { data: pendingCount } = usePendingApprovalsCount();
  const { logoUrl } = useEstateLogo();

  // Collapsible state - persisted in sessionStorage
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Expandable submenu state
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  // Load collapsed state from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('modern-sidebar-collapsed');
    if (saved === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  // Toggle collapse state
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    sessionStorage.setItem('modern-sidebar-collapsed', String(newState));
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

  // Check if any child is active
  const hasActiveChild = (children?: { href: string }[]) => {
    if (!children) return false;
    return children.some(
      (child) => pathname === child.href || pathname.startsWith(`${child.href}/`)
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col border-r transition-all duration-300 ease-in-out',
          // Modern theme: dark navy background
          'bg-[#1E293B] dark:bg-[#0F172A] text-white',
          // Width based on collapsed state
          isCollapsed ? 'w-[76px]' : 'w-[260px]',
          className
        )}
      >
        {/* Logo Section */}
        <div className={cn('p-6', isCollapsed ? 'px-4' : 'p-8')}>
          <Link href="/dashboard" className="flex items-center gap-3">
            {isCollapsed ? (
              // Collapsed: Show only icon
              logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Estate Logo"
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0EA5E9] text-white shadow-lg">
                  <span className="text-lg font-bold">R</span>
                </div>
              )
            ) : (
              // Expanded: Show full logo
              <>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Estate Logo"
                    className="h-10 w-auto max-w-[180px] object-contain"
                  />
                ) : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0EA5E9] text-white shadow-lg">
                      <span className="text-lg font-bold">R</span>
                    </div>
                    <span className="text-2xl font-bold">Residio</span>
                  </>
                )}
              </>
            )}
          </Link>
        </div>

        {/* Navigation Section */}
        <nav className={cn('flex-1 pb-6 space-y-6 overflow-y-auto', isCollapsed ? 'px-3' : 'px-6')}>
          {sections.map((section, sectionIndex) => (
            <div key={section.id}>
              {/* Section header - hidden when collapsed */}
              {section.label && !isCollapsed && (
                <h3 className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {section.label}
                </h3>
              )}
              {/* Section separator (except for first section) */}
              {!section.label && sectionIndex > 0 && (
                <div className="h-px bg-[#334155] my-3" />
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const showBadgeCount = item.showBadge && pendingCount && pendingCount > 0;
                  const hasChildren = item.children && item.children.length > 0;
                  const isExpanded = expandedMenus.has(item.id) || hasActiveChild(item.children);

                  const NavItem = (
                    <div
                      className={cn(
                        // Modern theme: generous padding, rounded corners
                        'flex items-center gap-4 rounded-xl text-sm font-medium transition-all duration-200 relative',
                        isCollapsed ? 'px-3 py-3 justify-center' : 'px-4 py-3',
                        isActive
                          ? 'bg-[#0EA5E9]/10 text-[#0EA5E9]'
                          : 'text-gray-300 hover:bg-[#334155] hover:text-white',
                        // Active state: teal left border
                        isActive && 'before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:rounded-r-full before:bg-[#0EA5E9]'
                      )}
                    >
                      <item.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-[#0EA5E9]')} />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {showBadgeCount && (
                            <Badge
                              variant="destructive"
                              className="h-6 min-w-[24px] px-2 text-xs font-semibold rounded-lg"
                            >
                              {pendingCount}
                            </Badge>
                          )}
                          {hasChildren && (
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-200',
                                isExpanded && 'rotate-180'
                              )}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {isCollapsed ? (
                        // Collapsed: Show tooltip on hover
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={item.href}>{NavItem}</Link>
                          </TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>
                            <p>{item.title}</p>
                            {showBadgeCount && (
                              <Badge variant="destructive" className="ml-2 h-5 min-w-[20px] px-1.5 text-xs">
                                {pendingCount}
                              </Badge>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : hasChildren ? (
                        // Expanded with children: Click to expand submenu
                        <button
                          type="button"
                          onClick={() => toggleSubmenu(item.id)}
                          className="w-full text-left cursor-pointer"
                        >
                          {NavItem}
                        </button>
                      ) : (
                        // Expanded without children: Regular link
                        <Link href={item.href}>{NavItem}</Link>
                      )}

                      {/* Nested children with indent - only shown when expanded and not collapsed */}
                      {hasChildren && !isCollapsed && (
                        <div
                          className={cn(
                            'overflow-hidden transition-all duration-200',
                            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                          )}
                        >
                          <ul className="mt-1 space-y-1">
                            {item.children!.map((child) => {
                              const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                              return (
                                <li key={child.id}>
                                  <Link
                                    href={child.href}
                                    className={cn(
                                      'flex items-center gap-4 rounded-xl px-4 py-2.5 pl-12 text-sm font-medium transition-all duration-200 relative',
                                      isChildActive
                                        ? 'bg-[#0EA5E9]/10 text-[#0EA5E9]'
                                        : 'text-gray-400 hover:bg-[#334155] hover:text-white',
                                      isChildActive && 'before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-r-full before:bg-[#0EA5E9]'
                                    )}
                                  >
                                    <child.icon className={cn('h-4 w-4', isChildActive && 'text-[#0EA5E9]')} />
                                    <span className="flex-1">{child.title}</span>
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
        </nav>

        {/* Footer Section */}
        <div className={cn('border-t border-[#334155] p-4 space-y-3', isCollapsed ? 'px-3' : 'p-6 space-y-4')}>
          {/* Theme Switcher - only show when expanded */}
          {!isCollapsed && <ThemeSwitcher />}

          {/* View as Resident link */}
          {residentId && (
            isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/portal"
                    className="flex items-center justify-center rounded-xl p-3 text-gray-300 hover:bg-[#334155] hover:text-white transition-all duration-200"
                  >
                    <User className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p>My Portal</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/portal"
                className="flex items-center gap-4 rounded-xl px-4 py-3 text-sm text-gray-300 hover:bg-[#334155] hover:text-white transition-all duration-200"
              >
                <User className="h-5 w-5" />
                <span>My Portal</span>
              </Link>
            )
          )}

          {/* Impersonate Resident link */}
          {hasPermission(PERMISSIONS.IMPERSONATION_START_SESSION) && (
            isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => router.push('/portal?impersonate=true')}
                    className="flex items-center justify-center rounded-xl p-3 text-gray-300 hover:bg-[#334155] hover:text-white transition-all duration-200 w-full cursor-pointer"
                  >
                    <UserSearch className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p>View as Resident</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/portal?impersonate=true')}
                className="flex items-center gap-4 rounded-xl px-4 py-3 text-sm text-gray-300 hover:bg-[#334155] hover:text-white transition-all duration-200 w-full text-left cursor-pointer"
              >
                <UserSearch className="h-5 w-5" />
                <span>View as Resident</span>
              </button>
            )
          )}

          {/* User Profile */}
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center p-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0EA5E9] text-white text-sm font-semibold">
                    {profile?.full_name?.charAt(0) || '?'}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="font-semibold">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.role_display_name || profile?.role?.replace('_', ' ')}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#334155]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0EA5E9] text-white text-sm font-semibold flex-shrink-0">
                {profile?.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-white">{profile?.full_name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {profile?.role_display_name || profile?.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}

          {/* Collapse Toggle Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl py-2 text-sm text-gray-400 hover:bg-[#334155] hover:text-white transition-all duration-200 w-full cursor-pointer',
              isCollapsed ? 'px-3' : 'px-4'
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
