'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  const pathname = usePathname();

  // Determine context-appropriate redirect
  const isPortalContext = pathname?.startsWith('/portal');
  const redirectPath = isPortalContext ? '/portal' : '/dashboard';
  const redirectLabel = isPortalContext ? 'Portal Dashboard' : 'Dashboard';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
      <div className="text-center">
        <h1 className="text-7xl font-bold text-muted-foreground/30">404</h1>
        <h2 className="text-2xl font-semibold mt-4">Page not found</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href={redirectPath}>
            <Home className="h-4 w-4 mr-2" />
            {redirectLabel}
          </Link>
        </Button>
        {!isPortalContext && (
          <Button variant="outline" asChild>
            <Link href="/residents">
              <Search className="h-4 w-4 mr-2" />
              Find Residents
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
