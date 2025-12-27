'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useResidentIndebtedness, useResidentWallet } from '@/hooks/use-billing';
import { useResidentSecurityContacts } from '@/hooks/use-security';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  AlertCircle,
  Shield,
  CreditCard,
  Home,
  ChevronRight,
  TrendingUp,
  Clock,
  Building2,
  UserPlus,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

/**
 * Resident Portal Home Page
 *
 * Mobile-first dashboard showing:
 * - Wallet balance
 * - Outstanding balance (indebtedness)
 * - Quick stats (security contacts, properties)
 * - Quick action buttons
 */
export default function ResidentPortalHomePage() {
  const { residentId } = useAuth();
  const { data: resident, isLoading: residentLoading } = useResident(residentId || undefined);
  const { data: indebtedness, isLoading: indebtednessLoading } = useResidentIndebtedness(residentId || undefined);
  const { data: wallet, isLoading: walletLoading } = useResidentWallet(residentId || undefined);
  const { data: contactsData, isLoading: contactsLoading } = useResidentSecurityContacts(residentId || undefined);

  const isLoading = residentLoading || indebtednessLoading || walletLoading || contactsLoading;

  // Count active properties
  const activeProperties = resident?.resident_houses?.filter(rh => rh.is_active)?.length || 0;

  // Count active security contacts
  const contacts = contactsData?.data || [];
  const activeContacts = contacts.filter(c => c.status === 'active')?.length || 0;

  if (isLoading) {
    return <PortalHomeSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back
        </h1>
        <p className="text-muted-foreground">
          {resident?.first_name} {resident?.last_name}
        </p>
      </div>

      {/* Balance Cards - responsive grid on desktop */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Wallet Balance */}
        <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20">
                  <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Wallet Balance</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(wallet?.balance || 0)}
                  </p>
                </div>
              </div>
              <TrendingUp className="h-5 w-5 text-emerald-500/40" />
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Balance */}
        {(indebtedness?.totalUnpaid || 0) > 0 && (
          <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-red-500/20">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                    <p className="text-xl font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(indebtedness?.totalUnpaid || 0)}
                    </p>
                  </div>
                </div>
                <Badge variant="destructive" className="text-xs">
                  {indebtedness?.invoiceCount || 0} invoice{(indebtedness?.invoiceCount || 0) !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Stats - 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/portal/profile">
          <Card className="h-full hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="p-4">
              {activeProperties > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Home className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{activeProperties}</p>
                    <p className="text-xs text-muted-foreground">Properties</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <Building2 className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1" />
                  <p className="text-xs text-muted-foreground">No properties</p>
                  <p className="text-[10px] text-muted-foreground/70">Contact admin</p>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/security-contacts">
          <Card className="h-full hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="p-4">
              {activeContacts > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{activeContacts}</p>
                    <p className="text-xs text-muted-foreground">Contacts</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <UserPlus className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1" />
                  <p className="text-xs text-muted-foreground">No contacts</p>
                  <p className="text-[10px] text-muted-foreground/70">Add your first</p>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Quick Actions - vertical mobile, horizontal grid on desktop */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 md:grid md:grid-cols-3 md:gap-3 md:space-y-0">
          <Link href="/portal/invoices" className="block">
            <Button variant="ghost" className="w-full justify-between h-auto py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <CreditCard className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">View Invoices</p>
                  <p className="text-xs text-muted-foreground">Check your payment history</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </Link>

          <Link href="/portal/security-contacts" className="block">
            <Button variant="ghost" className="w-full justify-between h-auto py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Shield className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Manage Contacts</p>
                  <p className="text-xs text-muted-foreground">Add or update security contacts</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </Link>

          <Link href="/portal/profile" className="block">
            <Button variant="ghost" className="w-full justify-between h-auto py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Home className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">My Properties</p>
                  <p className="text-xs text-muted-foreground">View property details</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Activity Placeholder */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <p className="text-sm">Recent activity will appear here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Skeleton for loading state
function PortalHomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid gap-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>

      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
