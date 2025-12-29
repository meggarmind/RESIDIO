'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { useHouse } from '@/hooks/use-houses';

interface BreadcrumbItem {
  label: string;
  href: string;
  isLoading?: boolean;
}

const pathLabels: Record<string, string> = {
  portal: 'Home',
  invoices: 'Invoices',
  'security-contacts': 'Security Contacts',
  documents: 'Documents',
  profile: 'Profile',
  properties: 'Properties',
};

// Check if a string is a UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function PortalBreadcrumb() {
  const pathname = usePathname();

  // Parse pathname into breadcrumb items
  const segments = pathname.split('/').filter(Boolean);

  // Check if we're on a property detail page
  const propertyIndex = segments.indexOf('properties');
  const propertyId = propertyIndex !== -1 && segments[propertyIndex + 1]
    ? segments[propertyIndex + 1]
    : null;

  // Fetch property data if we have a property ID
  const { data: house, isLoading: houseLoading } = useHouse(
    isUUID(propertyId || '') ? propertyId || undefined : undefined
  );

  // Don't show breadcrumb on home page
  if (pathname === '/portal') {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/portal' },
  ];

  // Build breadcrumb trail
  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === 'portal') continue; // Skip 'portal' as it's represented by 'Home'

    currentPath += `/${segment}`;
    const fullPath = `/portal${currentPath}`;

    let label: string;
    let isLoading = false;

    // Handle property ID - show shortname or address instead
    if (isUUID(segment) && segments[i - 1] === 'properties') {
      if (houseLoading) {
        label = '...';
        isLoading = true;
      } else if (house) {
        // Prefer short_name, fallback to street + house number
        label = house.short_name ||
          `${house.street?.name || ''} ${house.house_number}`.trim() ||
          segment.substring(0, 8) + '...';
      } else {
        label = segment.substring(0, 8) + '...';
      }
    } else {
      label = pathLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    }

    breadcrumbs.push({ label, href: fullPath, isLoading });
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
            <span className={`font-medium text-foreground ${item.isLoading ? 'animate-pulse' : ''}`}>
              {item.label}
            </span>
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
