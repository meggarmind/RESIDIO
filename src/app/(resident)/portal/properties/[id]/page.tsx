'use client';

import { use, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useHouse, useHouseResidents, useOwnershipHistory } from '@/hooks/use-houses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, AlertTriangle, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import { PropertyHeader } from '@/components/resident-portal/property-header';
import { CurrentOccupantsCard } from '@/components/resident-portal/current-occupants-card';
import { OccupancyHistoryTimeline } from '@/components/resident-portal/occupancy-history-timeline';
import { HouseholdMemberForm } from '@/components/resident-portal/household-member-form';
import type { ResidentRole, PrimaryResidentRole } from '@/types/database';

// Owner roles that can see full history
const OWNER_ROLES: ResidentRole[] = ['resident_landlord', 'non_resident_landlord', 'developer'];

interface PropertyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id: houseId } = use(params);
  const { residentId } = useAuth();
  const [showMemberForm, setShowMemberForm] = useState(false);

  // Fetch data
  const { data: resident, isLoading: residentLoading } = useResident(residentId || undefined);
  const { data: house, isLoading: houseLoading } = useHouse(houseId);
  const { data: houseResidents, isLoading: residentsLoading } = useHouseResidents(houseId);
  const { data: ownershipHistory, isLoading: historyLoading } = useOwnershipHistory(houseId);

  const isLoading = residentLoading || houseLoading || residentsLoading;

  // Find the current user's link to this house
  const userHouseLink = useMemo(() => {
    if (!resident?.resident_houses) return null;
    return resident.resident_houses.find(
      (rh) => rh.house?.id === houseId && rh.is_active
    );
  }, [resident, houseId]);

  // Determine user's role and permissions
  const userRole = userHouseLink?.resident_role as ResidentRole | undefined;
  const isPrimary = userHouseLink?.is_primary ?? false;
  const isOwner = userRole ? OWNER_ROLES.includes(userRole) : false;
  const canManageHousehold = isPrimary;
  const canViewHistory = isOwner;

  // Check if user has access to this property
  const hasAccess = !!userHouseLink;

  if (isLoading) {
    return <PropertyDetailSkeleton />;
  }

  // No access - user is not linked to this property
  if (!hasAccess || !house || !userRole) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You do not have access to view this property. Please ensure you are linked to this property as a resident.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/portal">Return to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Property Header */}
      <PropertyHeader
        house={house}
        residentRole={userRole}
        residentCount={houseResidents?.length || 0}
        isPrimary={isPrimary}
      />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Occupants */}
        <CurrentOccupantsCard residents={houseResidents || []} />

        {/* Household Management (Primary residents only) */}
        {canManageHousehold && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Household Members
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setShowMemberForm(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                As the primary resident, you can add household members, domestic staff, or caretakers to this property.
              </p>
              <div className="mt-4 text-xs text-muted-foreground">
                Household members can be added to the estate&apos;s security contact list to allow gate access.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Property Documents Link */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Property Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              View documents related to this property such as title documents, agreements, and receipts.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/portal/documents">View Documents</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Occupancy History (Owners only) */}
      {canViewHistory && (
        <OccupancyHistoryTimeline
          history={ownershipHistory}
          isLoading={historyLoading}
        />
      )}

      {/* Info for non-owners */}
      {!canViewHistory && (
        <Alert>
          <AlertDescription className="text-sm">
            Full occupancy history is only visible to property owners.
            As a {userRole?.replace('_', ' ')}, you can view the current occupants above.
          </AlertDescription>
        </Alert>
      )}

      {/* Household Member Form Dialog */}
      {canManageHousehold && (
        <HouseholdMemberForm
          houseId={houseId}
          open={showMemberForm}
          onOpenChange={setShowMemberForm}
        />
      )}
    </div>
  );
}

function PropertyDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Cards Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>

      {/* Timeline Skeleton */}
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
