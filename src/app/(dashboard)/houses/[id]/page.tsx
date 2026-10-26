'use client';

import { use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EnhancedPageHeader } from '@/components/dashboard/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HouseForm } from '@/components/houses/house-form';
import { HouseHeader } from '@/components/houses/house-header';
import { ResidentsTab } from '@/components/houses/residents-tab';
import { LandlordDuesCard } from '@/components/houses/landlord-dues-card';
import { resolveHouseTab } from '@/components/houses/house-detail-tabs';
import { isResidentNotFoundError } from '@/components/residents/resident-detail-tabs';
import { useHouse } from '@/hooks/use-houses';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { AlertCircle, Home } from 'lucide-react';
import HouseDetailLoading from './loading';

// Only Residents renders on first paint; Billing and History load when opened (#784).
const tabSkeleton = () => <Skeleton className="h-64 w-full rounded-xl" />;
const HousePaymentStatus = dynamic(
  () => import('@/components/houses/house-payment-status').then((m) => ({ default: m.HousePaymentStatus })),
  { loading: tabSkeleton, ssr: false }
);
const YearlyPaymentTable = dynamic(
  () => import('@/components/houses/yearly-payment-table').then((m) => ({ default: m.YearlyPaymentTable })),
  { loading: tabSkeleton, ssr: false }
);
const HistoryTimeline = dynamic(
  () => import('@/components/houses/history-timeline').then((m) => ({ default: m.HistoryTimeline })),
  { loading: tabSkeleton, ssr: false }
);

const tabTriggerClass = 'min-h-11 md:min-h-0 md:h-7';

interface HouseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function HouseDetailPage({ params }: HouseDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';
  const activeTab = resolveHouseTab(searchParams.get('tab'));
  const canUpdateHouse = useCan(PERMISSIONS.HOUSES_UPDATE);
  const { data: house, isLoading, error, refetch } = useHouse(id);

  const handleTabChange = (tab: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (tab === 'residents') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', tab);
    }
    const query = nextParams.toString();
    router.replace(`/houses/${id}${query ? `?${query}` : ''}`, { scroll: false });
  };

  if (isLoading) return <HouseDetailLoading />;

  if (error || !house) {
    // The not-found matcher reads PostgREST's single-row and bad-uuid errors, which are the same for any table.
    const notFound = !error || isResidentNotFoundError(error.message);
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center" role="alert">
        <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium">{notFound ? 'House not found' : 'Could not load this house'}</p>
          <p className="text-sm text-muted-foreground">
            {notFound
              ? 'This house does not exist, was removed, or is not visible to you.'
              : 'Something went wrong while loading. Check your connection and try again.'}
          </p>
        </div>
        <div className="flex gap-2">
          {!notFound && <Button onClick={() => { void refetch(); }}>Try again</Button>}
          <Button variant="outline" asChild>
            <Link href="/houses">Back to Houses</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ?edit=true is a URL anyone can type; only render the form for users who may save it.
  if (isEditing && canUpdateHouse) {
    return (
      <div className="space-y-6">
        <EnhancedPageHeader
          title="Edit House"
          description="Update property details."
          backHref={`/houses/${id}`}
          backLabel="Back to house"
          animate={false}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              House Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HouseForm house={house} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeResidents = house.resident_houses?.filter((rh) => rh.is_active) ?? [];

  return (
    // Bottom padding keeps the floating assistant pill clear of the last row on a phone.
    <div className="space-y-6 pb-20 md:pb-0">
      <HouseHeader house={house} activeResidentCount={activeResidents.length} />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-max p-1 md:h-9">
            <TabsTrigger value="residents" className={tabTriggerClass}>Residents</TabsTrigger>
            <TabsTrigger value="billing" className={tabTriggerClass}>Billing</TabsTrigger>
            <TabsTrigger value="history" className={tabTriggerClass}>History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="residents" className="space-y-6">
          <ResidentsTab house={house} activeResidents={activeResidents} />
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <HousePaymentStatus houseId={id} />
          {/* Keyed on the saved values so a refetch resets the form to them. */}
          <LandlordDuesCard key={`${house.dues_paid_by_landlord}:${house.dues_reminder_target}`} house={house} />
          <YearlyPaymentTable houseId={id} />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <HistoryTimeline houseId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
