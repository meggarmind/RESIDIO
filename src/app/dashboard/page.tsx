'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function ErrorHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'unauthorized') {
      toast.error('You do not have permission to access that page');
    }
  }, [searchParams]);

  return null;
}

export default function DashboardPage() {
  const { user, profile, isLoading, signOut } = useAuth();

  const canManageResidents = profile?.role && ['admin', 'chairman', 'financial_secretary'].includes(profile.role);
  const canViewPayments = profile?.role && ['admin', 'chairman', 'financial_secretary'].includes(profile.role);
  const canAccessSecurity = profile?.role && ['admin', 'chairman', 'security_officer'].includes(profile.role);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <ErrorHandler />
      </Suspense>
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Residio</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {profile?.full_name || user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Welcome to Residio</CardTitle>
              <CardDescription>
                Resident engagement, simplified
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Email:</span> {user?.email}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Role:</span>{' '}
                  <span className="capitalize">{profile?.role?.replace('_', ' ') || 'Loading...'}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {canManageResidents && (
            <Card>
              <CardHeader>
                <CardTitle>Residents</CardTitle>
                <CardDescription>Manage community members</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/residents">View Residents</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {canViewPayments && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
                <CardDescription>Track payment records</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/payments">View Payments</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {canAccessSecurity && (
            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage access control</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/security">Security Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}