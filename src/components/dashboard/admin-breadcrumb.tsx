'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface AdminBreadcrumbProps {
  hideDashboard?: boolean;
  className?: string;
}

// Admin path labels mapping
const pathLabels: Record<string, string> = {
  // Main sections
  dashboard: 'Dashboard',
  residents: 'Residents',
  houses: 'Houses',
  payments: 'Payments',
  billing: 'Billing',
  documents: 'Documents',
  settings: 'Settings',
  reports: 'Reports',
  analytics: 'Analytics',
  security: 'Security',
  audit: 'Audit Log',

  // Sub-sections
  import: 'Import',
  'email-imports': 'Email Imports',
  notifications: 'Notifications',
  templates: 'Templates',
  schedules: 'Schedules',
  history: 'History',
  queue: 'Queue',
  preferences: 'Preferences',
  roles: 'Roles',
  theme: 'Theme',

  // Actions
  new: 'New',
  edit: 'Edit',
};

// Check if a string is a UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function AdminBreadcrumb({ hideDashboard = false, className }: AdminBreadcrumbProps) {
  const pathname = usePathname();

  // Parse pathname into breadcrumb items
  const segments = pathname.split('/').filter(Boolean);

  // Don't show breadcrumb on dashboard home if not requested explicitly
  if (pathname === '/dashboard' && !hideDashboard) {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = hideDashboard
    ? []
    : [{ label: 'Dashboard', href: '/dashboard' }];

  // Build breadcrumb trail
  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === 'dashboard') continue; // Skip 'dashboard' as it's represented by first item

    currentPath += `/${segment}`;
    const fullPath = currentPath.startsWith('/dashboard') ? currentPath : `/dashboard${currentPath}`;

    let label: string;

    // Handle UUID segments - show truncated version
    if (isUUID(segment)) {
      // Get context from previous segment
      const prevSegment = segments[i - 1];
      const contextMap: Record<string, string> = {
        residents: 'Resident',
        houses: 'Property',
        payments: 'Payment',
        billing: 'Invoice',
        documents: 'Document',
        'email-imports': 'Import',
      };
      const context = contextMap[prevSegment] || 'Details';
      label = `${context} Details`;
    } else {
      label = pathLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
    }

    breadcrumbs.push({ label, href: fullPath });
  }

  if (breadcrumbs.length === 0) return null;

  return (
    <nav
      className={cn("flex items-center gap-1.5 text-sm text-muted-foreground mb-4", className)}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center gap-1.5">
        {breadcrumbs.map((item, index) => (
          <li key={item.href} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
            )}
            {index === breadcrumbs.length - 1 ? (
              <span className="font-medium text-foreground" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                {index === 0 && !hideDashboard && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
