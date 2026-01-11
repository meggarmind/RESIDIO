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
  Hexagon
} from 'lucide-react';
import { useEstateLogo } from '@/hooks/use-estate-logo';
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
        "fixed inset-y-0 left-0 z-30 flex flex-col items-center transition-colors duration-300 hidden md:flex",
        className
      )}
      style={{
        width: 'var(--sidebar-width)', // 80px
        background: 'var(--color-bg-card)',
        borderRight: '1px solid var(--color-bg-input)',
        padding: 'var(--space-4) var(--space-3)', // 16px 12px
      }}
    >
      {/* Logo/Brand Section */}
      <div
        className="flex items-center justify-center mb-8 flex-shrink-0"
        style={{
          width: '48px',
          height: '48px',
        }}
      >
        {logoUrl ? (
          /* Dynamic estate logo */
          <img
            src={logoUrl}
            alt="Estate Logo"
            className="h-10 w-10 object-contain rounded-lg"
          />
        ) : (
          /* Fallback: Icon */
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: '48px',
              height: '48px',
              background: 'var(--color-primary)',
            }}
          >
            <Hexagon
              className="text-white"
              style={{
                width: 'var(--icon-md)',
                height: 'var(--icon-md)',
              }}
            />
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 w-full flex flex-col items-center gap-2">
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
                      "flex items-center justify-center transition-all duration-150 hover:scale-105",
                      isActive
                        ? "shadow-md"
                        : ""
                    )}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: 'var(--radius-md)', // 8px
                      background: isActive ? 'var(--color-primary)' : 'transparent',
                      color: isActive ? '#FFFFFF' : 'var(--color-text-muted)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--color-bg-input)';
                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-muted)';
                      }
                    }}
                  >
                    <Icon
                      style={{
                        width: 'var(--icon-md)', // 24px
                        height: 'var(--icon-md)',
                      }}
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="ml-2">
                  <p style={{ fontSize: 'var(--text-sm)' }}>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>

      {/* Settings/Profile at Bottom */}
      <div className="mt-auto w-full flex flex-col items-center">
        {/* Divider */}
        <div
          className="w-full mb-4"
          style={{
            height: '1px',
            background: 'var(--color-bg-input)',
          }}
        />
      </div>
    </aside>
  );
}
