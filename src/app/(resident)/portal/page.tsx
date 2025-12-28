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
  TrendingUp,
  Clock,
  Building2,
  UserPlus,
  FileText,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Bell,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import Link from 'next/link';
import { ActivityFeed } from '@/components/resident-portal/activity-feed';
import { AnnouncementsCarousel } from '@/components/resident-portal/announcements-carousel';
import { useLayoutTheme } from '@/contexts/layout-theme-context';

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
  const { isExpanded } = useLayoutTheme();
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

  // Calculate action count (pending items requiring attention)
  const unpaidInvoices = indebtedness?.invoiceCount || 0;
  const actionCount = unpaidInvoices; // Can be extended with other actionable items

  // Check if balance is clear (celebratory state)
  const hasZeroBalance = (indebtedness?.totalUnpaid || 0) === 0;

  if (isLoading) {
    return <PortalHomeSkeleton />;
  }

  return (
    <div className={cn('space-y-6', isExpanded && 'space-y-8')}>
      {/* Welcome Section with Action Counter */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className={cn(
            'text-2xl font-bold tracking-tight',
            isExpanded && 'text-3xl xl:text-4xl'
          )}>
            Welcome back
          </h1>
          <p className="text-muted-foreground">
            {resident?.first_name} {resident?.last_name}
          </p>
        </div>
        {actionCount > 0 && (
          <Link href="/portal/invoices">
            <Badge
              variant="destructive"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium animate-pulse hover:animate-none"
            >
              <Bell className="h-3.5 w-3.5" />
              {actionCount} action{actionCount !== 1 ? 's' : ''}
            </Badge>
          </Link>
        )}
      </div>

      {/* Financial Summary Cards */}
      <div className={cn(
        'grid gap-3 md:grid-cols-2',
        isExpanded && 'lg:grid-cols-4 gap-4'
      )}>
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

        {/* Outstanding Balance or Celebratory Zero State */}
        {hasZeroBalance ? (
          <Card className="bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-teal-500/5 border-green-500/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/20 relative">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <Sparkles className="h-3 w-3 text-yellow-500 absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      All Clear!
                    </p>
                  </div>
                </div>
                <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30 text-xs">
                  Paid up
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
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
                  {unpaidInvoices} invoice{unpaidInvoices !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Stats - 2 cols mobile, 4 cols desktop, 6 cols expanded */}
      <div className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-4',
        isExpanded && 'xl:grid-cols-6 gap-4'
      )}>
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

      {/* Service Tiles - Vibrant grid */}
      <div className="space-y-3">
        <h2 className={cn(
          'text-base font-semibold',
          isExpanded && 'text-lg xl:text-xl'
        )}>Quick Services</h2>
        <div className={cn(
          'grid grid-cols-2 gap-3 md:grid-cols-4',
          isExpanded && 'xl:grid-cols-5 2xl:grid-cols-6 gap-4'
        )}>
          {/* Invoices Tile */}
          <Link href="/portal/invoices" className="group">
            <Card className="h-full bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="p-2.5 rounded-xl bg-amber-500/20 w-fit mb-3 group-hover:scale-110 transition-transform duration-300">
                  <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Invoices</h3>
                <p className="text-xs text-muted-foreground flex-1">View & pay your bills</p>
                <ArrowRight className="h-4 w-4 text-amber-600/50 mt-2 group-hover:translate-x-1 transition-transform" />
              </CardContent>
            </Card>
          </Link>

          {/* Security Contacts Tile */}
          <Link href="/portal/security-contacts" className="group">
            <Card className="h-full bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="p-2.5 rounded-xl bg-purple-500/20 w-fit mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Security</h3>
                <p className="text-xs text-muted-foreground flex-1">Manage contacts</p>
                <ArrowRight className="h-4 w-4 text-purple-600/50 mt-2 group-hover:translate-x-1 transition-transform" />
              </CardContent>
            </Card>
          </Link>

          {/* Documents Tile */}
          <Link href="/portal/documents" className="group">
            <Card className="h-full bg-gradient-to-br from-sky-500/10 via-cyan-500/5 to-transparent border-sky-500/20 hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-500/5 transition-all duration-300">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="p-2.5 rounded-xl bg-sky-500/20 w-fit mb-3 group-hover:scale-110 transition-transform duration-300">
                  <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Documents</h3>
                <p className="text-xs text-muted-foreground flex-1">Estate files & forms</p>
                <ArrowRight className="h-4 w-4 text-sky-600/50 mt-2 group-hover:translate-x-1 transition-transform" />
              </CardContent>
            </Card>
          </Link>

          {/* Profile Tile */}
          <Link href="/portal/profile" className="group">
            <Card className="h-full bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-transparent border-rose-500/20 hover:border-rose-500/40 hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-300">
              <CardContent className="p-4 flex flex-col h-full">
                <div className="p-2.5 rounded-xl bg-rose-500/20 w-fit mb-3 group-hover:scale-110 transition-transform duration-300">
                  <Home className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Profile</h3>
                <p className="text-xs text-muted-foreground flex-1">Your properties</p>
                <ArrowRight className="h-4 w-4 text-rose-600/50 mt-2 group-hover:translate-x-1 transition-transform" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Announcements & Activity - 2 col on desktop, 3 col expanded */}
      <div className={cn(
        'grid gap-4 md:grid-cols-2',
        isExpanded && 'xl:grid-cols-3'
      )}>
        {/* Estate Announcements */}
        <AnnouncementsCarousel
          announcements={[
            // Placeholder announcements - will be replaced with real data
            // when Phase 16 (Announcement System) is implemented
          ]}
        />

        {/* Recent Activity Feed */}
        <ActivityFeed
          activities={[
            // Placeholder - will be connected to real activity data
            // such as payments, invoice generations, etc.
          ]}
        />
      </div>
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
