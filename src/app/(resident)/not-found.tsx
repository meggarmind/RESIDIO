import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, FileQuestion } from 'lucide-react';

export default function PortalNotFound() {
  return (
    <div className="min-h-screen bg-bill-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-bill-card border border-border rounded-2xl p-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-16 w-16 bg-bill-secondary rounded-full flex items-center justify-center">
            <FileQuestion className="h-8 w-8 text-bill-text" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-bill-text mb-2">
          Page not found
        </h2>

        <p className="text-sm text-bill-text-secondary mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <Button asChild className="w-full">
          <Link href="/portal">
            <Home className="h-4 w-4 mr-2" />
            Return to Portal
          </Link>
        </Button>
      </div>
    </div>
  );
}
