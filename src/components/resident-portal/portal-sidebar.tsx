'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  Building,
  UserPlus,
  Wallet,
  Receipt,
  Shield,
  FileText,
  Megaphone,
  User,
  Hexagon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useEstateLogo } from '@/hooks/use-estate-logo';
import { useSidebarState } from '@/hooks/use-sidebar-state';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PortalSidebarProps {
  className?: string;
}

/**
 * Portal Sidebar - Modern Design System
 *
 * Icon-only navigation sidebar (80px width) following the portal-modern design system.
 *
 * Design Specifications:
 * - Width: 80px (var(--sidebar-width))
 * - Icon size: 24px (var(--icon-md))
 * - Nav item size: 48x48px
 * - Border radius: 8px (var(--radius-md))
 * - Active state: Primary color background + white icon
 * - Hover state: Light gray background
 * - Vertical flex layout with center alignment
 * - Logo at top: 48x48px icon box
 *
 * Accessibility:
 * - Tooltips show labels on hover
 * - aria-label for screen readers
 * - aria-current for active page
 */
export function PortalSidebar({ className }: PortalSidebarProps) {
  const pathname = usePathname();
  const { logoUrl } = useEstateLogo();
  const { isCollapsed, isExpanded, toggleCollapsed, setHoverExpanded } = useSidebarState();

  /**
   * Navigation items ordered by usage frequency
   */
  const navItems = [
    { href: '/portal', label: 'Dashboard', icon: Home },
    { href: '/portal/invoices', label: 'Invoices', icon: Receipt },
    { href: '/portal/wallet', label: 'Wallet', icon: Wallet },
    { href: '/portal/properties', label: 'My Properties', icon: Building },
    { href: '/portal/security-contacts', label: 'Security Contacts', icon: Shield },
    { href: '/portal/visitors', label: 'Visitors', icon: UserPlus },
    { href: '/portal/documents', label: 'Documents', icon: FileText },
    { href: '/portal/announcements', label: 'Announcements', icon: Megaphone },
    { href: '/portal/profile', label: 'Profile', icon: User },
  ];


  return (
    <aside
      className={cn(
        "flex flex-col transition-all duration-300 ease-in-out flex-shrink-0",
        isExpanded ? "items-start" : "items-center",
        className
      )}
      style={{
        width: isExpanded ? '256px' : '80px',
        minWidth: isExpanded ? '256px' : '80px',
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        padding: '16px 12px',
      }}
      onMouseEnter={() => isCollapsed && setHoverExpanded(true)}
      onMouseLeave={() => isCollapsed && setHoverExpanded(false)}
    >
      {/* Logo/Brand Section */}
      <div className={cn(
        "flex items-center mb-8 flex-shrink-0 w-full",
        isCollapsed && !isExpanded ? "justify-center" : "justify-between"
      )}>
        {isCollapsed && !isExpanded ? (
          /* Collapsed: Just show logo centered */
          logoUrl ? (
            <img
              src={logoUrl}
              alt="Estate Logo"
              className="h-10 w-10 object-contain rounded-lg"
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-lg"
              style={{ width: '48px', height: '48px', background: 'var(--primary)' }}
            >
              <Hexagon
                className="text-white"
                style={{
                  width: '24px',
                  height: '24px',
                }}
              />
            </div>
          )
        ) : (
          /* Expanded: Show logo + button in a row */
          <>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Estate Logo"
                className="h-10 w-10 object-contain rounded-lg flex-shrink-0"
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ width: '40px', height: '40px', background: 'var(--primary)' }}
              >
                <Hexagon
                  className="text-white"
                  style={{ width: '20px', height: '20px' }}
                />
              </div>
            )}

            <button
              onClick={toggleCollapsed}
              className="p-2 rounded-lg flex-shrink-0 transition-colors hover:bg-gray-100"
              style={{
                color: 'var(--muted-foreground)',
              }}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          </>
        )}
      </div>

      {/* Navigation Items */}
      <nav className={cn(
        "flex-1 w-full flex flex-col gap-2",
        isCollapsed && !isExpanded ? "items-center" : "items-stretch"
      )}>
        <TooltipProvider delayDuration={0}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/portal'
              ? pathname === '/portal'
              : pathname.startsWith(item.href);

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      "flex items-center transition-all duration-150",
                      isCollapsed && !isExpanded
                        ? "justify-center hover:scale-105"
                        : "gap-3 px-3 hover:translate-x-1",
                      isActive && "shadow-md"
                    )}
                    style={{
                      width: isCollapsed && !isExpanded ? '48px' : '100%',
                      height: '48px',
                      borderRadius: 'var(--radius)',
                      background: isActive ? 'var(--primary)' : 'transparent',
                      color: isActive ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--muted)';
                        e.currentTarget.style.color = 'var(--foreground)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--muted-foreground)';
                      }
                    }}
                  >
                    <Icon
                      className="flex-shrink-0"
                      style={{
                        width: '24px',
                        height: '24px',
                      }}
                    />
                    {isExpanded && (
                      <span className="text-sm font-medium truncate">
                        {item.label}
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>

      {/* Settings/Profile at Bottom */}
      <div className="mt-auto w-full flex flex-col items-center">
        {/* Divider */}
        <div
          className="w-full mb-4"
          style={{
            height: '1px',
            background: 'var(--border)',
          }}
        />
      </div>
    </aside>
  );
}
