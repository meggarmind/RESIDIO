'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useResidentIndebtedness, useResidentWallet } from '@/hooks/use-billing';
import { useResidentSecurityContacts } from '@/hooks/use-security';
import { useHouseResidentsBatch } from '@/hooks/use-houses';
import { usePublishedAnnouncements } from '@/hooks/use-announcements';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  AlertCircle,
  Shield,
  CreditCard,
  Home,
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
import { PropertyCarousel } from '@/components/resident-portal/property-carousel';
import { useLayoutTheme } from '@/contexts/layout-theme-context';
import type { HouseWithStreet, ResidentRole } from '@/types/database';

/**
 * Resident Portal Home Page
 *
 * Property-centric dashboard showing:
 * - Property carousel (hero section)
 * - Compact financial summary
 * - Quick stats (security contacts)
 * - Quick action buttons
 */
export default function ResidentPortalHomePage() {
  const router = useRouter();
  const { residentId } = useAuth();
  const { isExpanded } = useLayoutTheme();
  const { data: resident, isLoading: residentLoading } = useResident(residentId || undefined);
  const { data: indebtedness, isLoading: indebtednessLoading } = useResidentIndebtedness(residentId || undefined);
  const { data: wallet, isLoading: walletLoading } = useResidentWallet(residentId || undefined);
  const { data: contactsData, isLoading: contactsLoading } = useResidentSecurityContacts(residentId || undefined);

  // Fetch published announcements for carousel
  const { data: announcements = [], isLoading: announcementsLoading } = usePublishedAnnouncements({ limit: 5 });

  // Get active properties with their house IDs
  const activeResidentHouses = useMemo(() => {
    return resident?.resident_houses?.filter(rh => rh.is_active) || [];
  }, [resident]);

  const houseIds = useMemo(() => {
    return activeResidentHouses.map(rh => rh.house?.id).filter(Boolean) as string[];
  }, [activeResidentHouses]);

  // Fetch residents for all houses in batch
  const { data: houseResidentsMap, isLoading: residentsLoading } = useHouseResidentsBatch(houseIds);

  const isLoading = residentLoading || indebtednessLoading || walletLoading || contactsLoading || residentsLoading;

  // Build property data for carousel - sort to put primary property first
  const propertyData = useMemo(() => {
    return activeResidentHouses
      .filter(rh => rh.house) // Ensure house exists
      .sort((a, b) => {
        // Primary property first
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return 0;
      })
      .map(rh => ({
        house: rh.house as HouseWithStreet,
        residentRole: rh.resident_role as ResidentRole,
        isPrimary: rh.is_primary ?? false,
        residents: houseResidentsMap?.[rh.house!.id] || [],
      }));
  }, [activeResidentHouses, houseResidentsMap]);

  // Count active properties
  const activeProperties = activeResidentHouses.length;

  // Count active security contacts
  const contacts = contactsData?.data || [];
  const activeContacts = contacts.filter(c => c.status === 'active')?.length || 0;

  // Calculate action count (pending items requiring attention)
  const unpaidInvoices = indebtedness?.invoiceCount || 0;
  const actionCount = unpaidInvoices;

  // Check if balance is clear (celebratory state)
  const hasZeroBalance = (indebtedness?.totalUnpaid || 0) === 0;

  // Handle property card click - navigate to property detail
  const handlePropertyClick = (houseId: string) => {
    router.push(`/portal/properties/${houseId}`);
  };

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

      {/* Property Carousel - Hero Section */}
      {activeProperties > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className={cn(
              'text-base font-semibold',
              isExpanded && 'text-lg'
            )}>
              My Properties
            </h2>
            {activeProperties > 1 && (
              <span className="text-xs text-muted-foreground">
                {activeProperties} properties
              </span>
            )}
          </div>
          <PropertyCarousel
            properties={propertyData}
            onPropertyClick={handlePropertyClick}
          />
        </section>
      ) : (
        <Card className="border-dashed border-2">
          <CardContent className="p-6 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="font-semibold text-lg mb-1">No Properties Assigned</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              You don&apos;t have any properties linked to your account yet.
              Please contact your estate administrator.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Compact Financial Summary */}
      <div className={cn(
        'grid gap-3',
        isExpanded ? 'md:grid-cols-3' : 'md:grid-cols-2'
      )}>
        {/* Wallet Balance - Compact */}
        <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate">
                {formatCurrency(wallet?.balance || 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Balance - Compact */}
        {hasZeroBalance ? (
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20 relative">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <Sparkles className="h-2.5 w-2.5 text-yellow-500 absolute -top-0.5 -right-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  All Clear!
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/20">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 truncate">
                  {formatCurrency(indebtedness?.totalUnpaid || 0)}
                </p>
              </div>
              <Badge variant="destructive" className="text-[10px] shrink-0">
                {unpaidInvoices}
              </Badge>
            </CardContent>
          </Card>
        )}

        {/* Security Contacts - Compact */}
        <Link href="/portal/security-contacts" className="contents">
          <Card className="hover:border-primary/30 transition-colors cursor-pointer">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Shield className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Contacts</p>
                {activeContacts > 0 ? (
                  <p className="text-lg font-bold">{activeContacts}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <UserPlus className="h-3 w-3 inline mr-1" />
                    Add first
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
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
                <p className="text-xs text-muted-foreground flex-1">Your account & settings</p>
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
          announcements={announcements}
          isLoading={announcementsLoading}
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
      {/* Welcome Section */}
      <div className="space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Property Carousel Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="flex justify-center gap-1.5">
          <Skeleton className="h-1.5 w-4 rounded-full" />
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
        </div>
      </div>

      {/* Financial Summary Skeleton */}
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>

      {/* Quick Services Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>

      {/* Activity Section Skeleton */}
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
