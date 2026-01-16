'use client';

import { use, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useHouse, useHouseResidents, useOwnershipHistory } from '@/hooks/use-houses';
import { useInvoices, useResidentIndebtedness } from '@/hooks/use-billing';
import { useWallet } from '@/hooks/use-wallet';
import { useResidentSecurityContacts, useAccessLogs } from '@/hooks/use-security';
import { useResidentDocuments } from '@/hooks/use-documents';
import { usePayments } from '@/hooks/use-payments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Users, AlertTriangle, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { toast } from 'sonner';

import { PropertyHeader } from '@/components/resident-portal/property-header';
import { CurrentOccupantsCard } from '@/components/resident-portal/current-occupants-card';
import { OccupancyHistoryTimeline } from '@/components/resident-portal/occupancy-history-timeline';
import { HouseholdMemberForm } from '@/components/resident-portal/household-member-form';
import { PropertyFinancialSummaryCard } from '@/components/resident-portal/property-financial-summary-card';
import { PropertyRecentInvoicesCard } from '@/components/resident-portal/property-recent-invoices-card';
import { PaymentDialogManager } from '@/components/resident-portal/payment-dialog-manager';
import { PropertySecurityContactsCard } from '@/components/resident-portal/property-security-contacts-card';
import { PropertyVisitorActivityCard } from '@/components/resident-portal/property-visitor-activity-card';
import { PropertyDocumentsCard } from '@/components/resident-portal/property-documents-card';
import { PropertyQuickActionsMenu } from '@/components/resident-portal/property-quick-actions-menu';
import { PropertyPaymentHistoryTimeline } from '@/components/resident-portal/property-payment-history-timeline';
import { MoveOutWizard } from '@/components/residents/move-out-wizard';
import type { ResidentRole, Invoice } from '@/types/database';
import { isPrimaryRole } from '@/lib/validators/resident';

// Owner roles that can see full history
const OWNER_ROLES: ResidentRole[] = ['resident_landlord', 'non_resident_landlord', 'developer'];

interface PropertyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id: houseId } = use(params);
  const { residentId } = useAuth();
  const queryClient = useQueryClient();
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [showMoveOutWizard, setShowMoveOutWizard] = useState(false);

  // Fetch existing data
  const { data: resident, isLoading: residentLoading } = useResident(residentId || undefined);
  const { data: house, isLoading: houseLoading } = useHouse(houseId);
  const { data: houseResidents, isLoading: residentsLoading } = useHouseResidents(houseId);
  const { data: ownershipHistory, isLoading: historyLoading } = useOwnershipHistory(houseId);

  // Fetch NEW data (Phase 1-3)
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({
    houseId,
    residentId: residentId || '',
    limit: 100,
  });
  const { data: indebtedness } = useResidentIndebtedness(residentId || '');
  const { data: wallet } = useWallet(residentId || '');
  const { data: securityContactsData } = useResidentSecurityContacts(residentId || '');
  const { data: accessLogsData } = useAccessLogs({ limit: 10 });
  const { data: allDocuments } = useResidentDocuments({ limit: 100 });
  const { data: paymentsData } = usePayments({
    resident_id: residentId || '',
    limit: 10,
    page: 1,
  });

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
  const isOwner = userRole ? OWNER_ROLES.includes(userRole) : false;

  // Primary residents can manage household (add members, manage security contacts)
  // This includes: resident_landlord, tenant, non_resident_landlord, developer
  const canManageHousehold = userRole ? isPrimaryRole(userRole) : false;
  const canViewHistory = isOwner;

  // Check if user has access to this property
  const hasAccess = !!userHouseLink;

  // Client-side filtering for user-specific data (CRITICAL: filter by BOTH house_id AND resident_id)
  const userInvoices = useMemo(() =>
    invoicesData?.data?.filter(inv =>
      inv.resident_id === residentId && inv.house_id === houseId
    ) || []
    , [invoicesData, residentId, houseId]);

  const recentInvoices = useMemo(() => userInvoices.slice(0, 5), [userInvoices]);

  const propertyDocuments = useMemo(() =>
    allDocuments?.data?.filter(d => d.house_id === houseId) || []
    , [allDocuments, houseId]);

  const propertySecurityContacts = useMemo(() =>
    securityContactsData?.data?.filter(c =>
      c.status === 'active'
    ).slice(0, 5) || []
    , [securityContactsData]);

  const propertyAccessLogs = useMemo(() =>
    accessLogsData?.data?.slice(0, 10) || []
    , [accessLogsData]);

  const propertyPayments = useMemo(() =>
    paymentsData?.data?.slice(0, 10) || []
    , [paymentsData]);

  // Calculate financial summary
  const userOutstanding = useMemo(() =>
    userInvoices
      .filter(inv => ['unpaid', 'partially_paid', 'overdue'].includes(inv.status || ''))
      .reduce((sum, inv) => sum + ((inv.amount_due || 0) - (inv.amount_paid || 0)), 0)
    , [userInvoices]);

  const totalPaid = useMemo(() =>
    userInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0)
    , [userInvoices]);

  // Payment dialog handlers
  const handlePayNow = (invoice: Invoice) => {
    setPaymentInvoice(invoice);
  };

  const handlePaymentSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
    queryClient.invalidateQueries({ queryKey: ['resident-indebtedness'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    toast.success('Payment successful');
  };

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
      {/* Breadcrumbs / Back Navigation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal" className="hover:text-foreground transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href="/portal/properties" className="hover:text-foreground transition-colors">Properties</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{house.house_number || house.short_name}</span>
      </div>

      {/* Property Header */}
      <PropertyHeader
        house={house}
        residentRole={userRole}
        residentCount={houseResidents?.length || 0}
      />

      {/* Financial Summary (Prominent Position) */}
      <PropertyFinancialSummaryCard
        invoices={userInvoices}
        outstanding={userOutstanding}
        walletBalance={wallet?.data?.balance || 0}
        totalPaid={totalPaid}
        isLoading={invoicesLoading}
      />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Recent Invoices (Tier 1) */}
          <PropertyRecentInvoicesCard
            invoices={recentInvoices}
            isLoading={invoicesLoading}
            onPayNow={handlePayNow}
            houseId={houseId}
          />

          {/* Security Contacts (Tier 1) */}
          <PropertySecurityContactsCard
            contacts={propertySecurityContacts}
            isLoading={false}
            canManage={canManageHousehold}
            houseId={houseId}
          />

          {/* Current Occupants */}
          <CurrentOccupantsCard residents={houseResidents || []} />

          {/* Visitor Activity (Tier 2) */}
          <PropertyVisitorActivityCard
            accessLogs={propertyAccessLogs}
            isLoading={false}
            houseId={houseId}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions (Tier 1) */}
          <PropertyQuickActionsMenu
            houseId={houseId}
            residentId={residentId || undefined}
            canManage={canManageHousehold}
            isLoading={false}
            onAddMember={() => setShowMemberForm(true)}
            onMoveOut={() => setShowMoveOutWizard(true)}
            isTenant={userRole === 'tenant'}
          />

          {/* Payment History (Tier 2) */}
          <PropertyPaymentHistoryTimeline
            payments={propertyPayments}
            isLoading={false}
            houseId={houseId}
          />

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
                  As the primary resident, you can add family members, domestic staff, or caretakers to this property.
                </p>
                <div className="mt-4 text-xs text-muted-foreground">
                  Family members can be added to the estate&apos;s security contact list to allow gate access.
                </div>
              </CardContent>
            </Card>
          )}

          {/* Property Documents (Tier 2) */}
          <PropertyDocumentsCard
            documents={propertyDocuments.slice(0, 5)}
            isLoading={false}
            houseId={houseId}
          />

          {/* Occupancy History (Owners only) */}
          {canViewHistory && (
            <OccupancyHistoryTimeline
              history={ownershipHistory}
              isLoading={historyLoading}
            />
          )}
        </div>
      </div>

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
          currentUserRole={userRole}
        />
      )}

      {/* Payment Dialog Manager */}
      <PaymentDialogManager
        invoice={paymentInvoice}
        open={!!paymentInvoice}
        onOpenChange={(open) => !open && setPaymentInvoice(null)}
        walletBalance={wallet?.data?.balance || 0}
        onSuccess={handlePaymentSuccess}
      />
      {/* Move Out Wizard */}
      {userRole === 'tenant' && (
        <MoveOutWizard
          open={showMoveOutWizard}
          onOpenChange={setShowMoveOutWizard}
          residentId={residentId || ''}
          residentName={resident ? `${resident.first_name} ${resident.last_name}` : ''}
          houseId={houseId}
          houseAddress={house ? `${house.short_name || house.house_number}, ${house.street?.name}` : ''}
          isSelfService={true}
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
