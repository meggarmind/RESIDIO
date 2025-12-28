'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href: string;
}

const pathLabels: Record<string, string> = {
  portal: 'Home',
  invoices: 'Invoices',
  'security-contacts': 'Security Contacts',
  documents: 'Documents',
  profile: 'Profile',
};

export function PortalBreadcrumb() {
  const pathname = usePathname();

  // Parse pathname into breadcrumb items
  const segments = pathname.split('/').filter(Boolean);

  // Don't show breadcrumb on home page
  if (pathname === '/portal') {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/portal' },
  ];

  // Build breadcrumb trail
  let currentPath = '';
  for (const segment of segments) {
    if (segment === 'portal') continue; // Skip 'portal' as it's represented by 'Home'

    currentPath += `/${segment}`;
    const fullPath = `/portal${currentPath}`;
    const label = pathLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

    breadcrumbs.push({ label, href: fullPath });
  }

  return (
    <nav
      className="hidden md:flex items-center gap-1 text-sm text-muted-foreground mb-4"
      aria-label="Breadcrumb"
    >
      {breadcrumbs.map((item, index) => (
        <span key={item.href} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-4 w-4" />}
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-foreground">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              {index === 0 && <Home className="h-3.5 w-3.5" />}
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
