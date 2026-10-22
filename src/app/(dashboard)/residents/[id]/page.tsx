'use client';

import { use, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { isModifiedClick, navigateWithSharedElement } from '@/lib/navigation/shared-element-transition';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResidentForm } from '@/components/residents/resident-form';
import { ResidentArchiveDialog } from '@/components/residents/resident-archive-dialog';
import { ResidentMergeDialog } from '@/components/residents/resident-merge-dialog';
import { AccountStatusBadge } from '@/components/residents/status-badge';
import { useResident, useDeleteResident, useUpdateResidentStatus, useVerifyResident } from '@/hooks/use-residents';
import { useVerificationStatus, useAdminVerifyContact } from '@/hooks/use-verification';
import { useWallet } from '@/hooks/use-wallet';
import { LinkedHouses } from '@/components/residents/linked-houses';
import { CrossPropertyPaymentSummary } from '@/components/residents/cross-property-payment-summary';
import { resolveResidentTab, isResidentNotFoundError } from '@/components/residents/resident-detail-tabs';
import { ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { PageTransition } from '@/components/ui/page-transition';
import { IconBox } from '@/components/ui/icon-box';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Pencil, Trash2, Phone, Mail, ArrowLeft, UserCircle, Link as LinkIcon, ShieldCheck, Shield, UserCheck, StickyNote, AlertCircle, UserRoundCheck, UserRoundX, Wallet, Loader2, Building2, CalendarClock, IdCard, MoreHorizontal, Merge } from 'lucide-react';
import { toast } from 'sonner';

// Only Overview renders on first paint; the other tabs load when opened (#783).
const tabSkeleton = () => <Skeleton className="h-64 w-full rounded-xl" />;
const ResidentMoneyTab = dynamic(
  () => import('@/components/residents/resident-money-tab').then((m) => ({ default: m.ResidentMoneyTab })),
  { loading: tabSkeleton, ssr: false }
);
const ResidentSecurityContacts = dynamic(
  () => import('@/components/residents/resident-security-contacts').then((m) => ({ default: m.ResidentSecurityContacts })),
  { loading: tabSkeleton, ssr: false }
);
const NotesTimeline = dynamic(
  () => import('@/components/notes').then((m) => ({ default: m.NotesTimeline })),
  { loading: tabSkeleton, ssr: false }
);

const tabTriggerClass = 'text-xs min-h-11 md:min-h-0 md:h-7';

interface ResidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ResidentDetailPage({ params }: ResidentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';
  const tabParam = searchParams.get('tab');

  // Each tab change is a history entry, and the tab is read back from the URL,
  // so back/forward moves between tabs.
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const query = params.toString();
    router.push(`/residents/${id}${query ? `?${query}` : ''}`, { scroll: false });
  };

  const { data: resident, isLoading, error, refetch } = useResident(id);
  const { data: verificationStatus } = useVerificationStatus(id);
  const deleteMutation = useDeleteResident();
  const updateStatusMutation = useUpdateResidentStatus();
  const verifyMutation = useVerifyResident();
  const adminVerify = useAdminVerifyContact();
  const { data: walletData } = useWallet(id);
  const headerRef = useRef<HTMLDivElement>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  // Not in the generated types until #987's migrations are applied and db:types is re-run.
  const mergedIntoId = (resident as { merged_into_resident_id?: string | null } | undefined)?.merged_into_resident_id ?? undefined;
  const { data: mergedInto } = useResident(mergedIntoId);

  // Notes permissions
  const { hasPermission, isLoading: authLoading } = useAuth();
  const canUpdateResident = hasPermission(PERMISSIONS.RESIDENTS_UPDATE);
  const canDeleteResident = hasPermission(PERMISSIONS.RESIDENTS_DELETE);
  const canVerifyResident = hasPermission(PERMISSIONS.RESIDENTS_VERIFY);
  const canMergeResidents = hasPermission(PERMISSIONS.RESIDENTS_MERGE);
  const canViewNotes = hasPermission(PERMISSIONS.NOTES_VIEW);
  const canCreateNotes = hasPermission(PERMISSIONS.NOTES_CREATE);
  const canEditNotes = hasPermission(PERMISSIONS.NOTES_UPDATE);
  const canDeleteNotes = hasPermission(PERMISSIONS.NOTES_DELETE);

  const activeTab = resolveResidentTab(tabParam, canViewNotes);
  const wallet = walletData?.data;
  const walletBalance = wallet?.balance || 0;
  const emailVerified = !!verificationStatus?.email?.verified;
  const phoneVerified = !!verificationStatus?.phone?.verified;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Resident archived successfully');
      router.push('/residents');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive resident');
    }
  };

  // One "Verify contact" action: marks each unverified contact verified, then the resident.
  const handleVerifyContact = async () => {
    if (!resident) return;
    const pending: Array<'email' | 'phone'> = [];
    if (resident.email && !emailVerified) pending.push('email');
    if (resident.phone_primary && !phoneVerified) pending.push('phone');
    try {
      for (const contactType of pending) {
        await adminVerify.mutateAsync({ residentId: id, contactType });
      }
      if (resident.verification_status !== 'verified') {
        await verifyMutation.mutateAsync(id);
      }
      toast.success('Contact details verified');
      setIsVerifyDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to verify contact details');
    }
  };

  const handleStatusChange = async () => {
    if (!resident) return;

    const accountStatus = resident.account_status === 'inactive' ? 'active' : 'inactive';
    try {
      await updateStatusMutation.mutateAsync({ id, accountStatus });
      toast.success(accountStatus === 'active' ? 'Resident reactivated' : 'Resident marked inactive');
      setIsStatusDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update resident status');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading resident">
        <div className="flex items-center gap-x-3 gap-y-2">
          <div className="h-8 w-8 rounded-md bg-muted" />
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-5 w-24 rounded bg-muted" />
        </div>
        <div className="flex gap-1.5 h-9 p-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded bg-muted" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ShimmerCard />
          <ShimmerCard />
        </div>
        <ShimmerCard />
      </div>
    );
  }

  if (error || !resident) {
    const notFound = !error || isResidentNotFoundError(error.message);
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center" role="alert">
        <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium">{notFound ? 'Resident not found' : 'Could not load this resident'}</p>
          <p className="text-sm text-muted-foreground">
            {notFound
              ? 'This resident does not exist, was removed, or is not visible to you.'
              : 'Something went wrong while loading. Check your connection and try again.'}
          </p>
        </div>
        <div className="flex gap-2">
          {!notFound && (
            <Button onClick={() => { void refetch(); }}>Try again</Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/residents">Back to Residents</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isEditing && !authLoading && !canUpdateResident) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-destructive">You do not have permission to edit residents.</p>
        <Button variant="outline" asChild><Link href={`/residents/${id}`}>Back to Resident</Link></Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href={`/residents/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">Edit Resident</h1>
            <p className="text-muted-foreground">Update resident details.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Resident Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResidentForm resident={resident} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasEmergencyContact = !!(resident.emergency_contact_name || resident.emergency_contact_phone || resident.emergency_contact_resident);
  const needsContactVerification = (!!resident.email && !emailVerified) || (!!resident.phone_primary && !phoneVerified);
  const headerButtonClass = 'min-h-11 text-xs md:min-h-0 md:h-8';

  return (
    <PageTransition>
    <div className="space-y-4">
      {/* Compact header bar */}
      <div
        ref={headerRef}
        style={{ viewTransitionName: `resident-${id}` }}
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <Button variant="ghost" size="icon" className="size-11 md:size-8" asChild aria-label="Go back">
          <Link
            href="/residents"
            onClick={(event) => {
              if (event.defaultPrevented || isModifiedClick(event)) return;
              event.preventDefault();
              void navigateWithSharedElement({
                push: (href) => router.push(href),
                href: '/residents',
                sourceEl: headerRef.current,
                name: `resident-${id}`,
              });
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight">
          <Avatar className="mr-2 inline-flex size-7 align-middle">
            <AvatarFallback className="text-xs">
              {resident.first_name[0]}{resident.last_name[0]}
            </AvatarFallback>
          </Avatar>
          {resident.first_name} {resident.last_name}
        </h1>
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded tabular-nums">
          {resident.resident_code}
        </span>
        <AccountStatusBadge status={resident.account_status} />
        <span className="text-xs text-muted-foreground capitalize">{resident.resident_type}</span>

        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {canUpdateResident && (
            <Button variant="outline" size="sm" asChild className={headerButtonClass}>
              <Link href={`/residents/${id}?edit=true`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Link>
            </Button>
          )}
          {(canUpdateResident || canDeleteResident || (canMergeResidents && !mergedIntoId)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={headerButtonClass}>
                  <MoreHorizontal className="h-3.5 w-3.5 mr-1.5" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canUpdateResident && (
                  <DropdownMenuItem onClick={() => setIsStatusDialogOpen(true)}>
                    {resident.account_status === 'inactive' ? <UserRoundCheck className="mr-2 h-4 w-4" /> : <UserRoundX className="mr-2 h-4 w-4" />}
                    {resident.account_status === 'inactive' ? 'Reactivate' : 'Inactivate'}
                  </DropdownMenuItem>
                )}
                {canMergeResidents && !mergedIntoId && (
                  <DropdownMenuItem onClick={() => setIsMergeDialogOpen(true)}>
                    <Merge className="mr-2 h-4 w-4" />
                    Merge residents
                  </DropdownMenuItem>
                )}
                {(canUpdateResident || (canMergeResidents && !mergedIntoId)) && canDeleteResident && <DropdownMenuSeparator />}
                {canDeleteResident && (
                  <DropdownMenuItem variant="destructive" onClick={() => setIsArchiveDialogOpen(true)} disabled={deleteMutation.isPending}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {mergedIntoId && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <Merge className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>Merged into {mergedInto?.resident_code ?? 'another record'}.</span>
          <Link href={`/residents/${mergedIntoId}`} className="font-medium underline underline-offset-2">
            Open the kept record
          </Link>
        </div>
      )}

      {canMergeResidents && !mergedIntoId && (
        <ResidentMergeDialog
          open={isMergeDialogOpen}
          onOpenChange={setIsMergeDialogOpen}
          resident={resident}
          onMerged={(result) => {
            if (result.kept_resident_id !== id) router.push(`/residents/${result.kept_resident_id}`);
          }}
        />
      )}

      <AlertDialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resident.account_status === 'inactive' ? 'Reactivate resident?' : 'Mark resident inactive?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {resident.account_status === 'inactive'
                ? 'This restores the resident to active operational lists and notifications.'
                : 'This removes the resident from active operational lists and notifications. It does not change portal login access.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusChange} disabled={updateStatusMutation.isPending}>
              {resident.account_status === 'inactive' ? 'Reactivate' : 'Mark inactive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canVerifyResident && (
        <AlertDialog open={isVerifyDialogOpen} onOpenChange={setIsVerifyDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Verify contact details?</AlertDialogTitle>
              <AlertDialogDescription>
                This marks {[resident.email && !emailVerified ? 'the email address' : null, resident.phone_primary && !phoneVerified ? 'the phone number' : null].filter(Boolean).join(' and ')} as verified by an admin, and the resident as verified. Confirm you have checked them against a trusted source.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => { event.preventDefault(); void handleVerifyContact(); }}
                disabled={adminVerify.isPending || verifyMutation.isPending}
              >
                {(adminVerify.isPending || verifyMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {canDeleteResident && (
        <ResidentArchiveDialog
          open={isArchiveDialogOpen}
          onOpenChange={setIsArchiveDialogOpen}
          residentId={id}
          residentName={`${resident.first_name} ${resident.last_name}`}
          activeHouseCount={(resident.resident_houses ?? []).filter((rh) => rh.is_active).length}
          onConfirm={handleDelete}
          isPending={deleteMutation.isPending}
        />
      )}

      <Tabs value={activeTab} className="w-full" onValueChange={handleTabChange}>
        <div className="sticky top-0 z-10 overflow-x-auto scrollbar-modern">
          <TabsList className="glass h-auto w-max p-1 md:h-9">
            <TabsTrigger value="overview" className={tabTriggerClass}>Overview</TabsTrigger>
            <TabsTrigger value="money" className={tabTriggerClass}>
              <Wallet className="h-3.5 w-3.5 mr-1" />
              Money
            </TabsTrigger>
            <TabsTrigger value="security" className={tabTriggerClass}>
              <Shield className="h-3.5 w-3.5 mr-1" />
              Security
            </TabsTrigger>
            {canViewNotes && (
              <TabsTrigger value="notes" className={tabTriggerClass}>
                <StickyNote className="h-3.5 w-3.5 mr-1" />
                Notes
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Top row: Identity + Financial Summary */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Identity & Contact */}
            <Card variant="compact" className="card-hover-modern h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <IconBox color="blue" size="sm">
                    <UserCircle className="h-4 w-4" />
                  </IconBox>
                  Identity &amp; Contact
                  {resident.entity_type !== 'individual' && (
                    <Badge variant="outline" className="ml-auto text-xs font-normal capitalize">
                      {resident.entity_type}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="divide-y divide-border text-sm">
                  <div className="flex justify-between items-center gap-3 py-1.5">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Phone
                    </span>
                    <span className="font-medium">{resident.phone_primary}</span>
                  </div>
                  {resident.phone_secondary && (
                    <div className="flex justify-between items-center gap-3 py-1.5">
                      <span className="text-muted-foreground">Secondary Phone</span>
                      <span className="font-medium">{resident.phone_secondary}</span>
                    </div>
                  )}
                  {resident.email && (
                    <div className="flex justify-between items-center gap-3 py-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </span>
                      <span className="font-medium truncate max-w-[60%]" title={resident.email}>{resident.email}</span>
                    </div>
                  )}
                  {resident.entity_type !== 'individual' && (resident.company_name || resident.rc_number) && (
                    <div className="flex justify-between items-center gap-3 py-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" /> Company
                      </span>
                      <span className="font-medium text-right">
                        {resident.company_name}
                        {resident.rc_number && (
                          <span className="text-muted-foreground font-normal"> · RC {resident.rc_number}</span>
                        )}
                      </span>
                    </div>
                  )}
                  {resident.entity_type !== 'individual' && (resident.liaison_contact_name || resident.liaison_contact_phone) && (
                    <div className="flex justify-between items-center gap-3 py-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" /> Liaison Contact
                      </span>
                      <span className="font-medium text-right">
                        {resident.liaison_contact_name}
                        {resident.liaison_contact_phone && (
                          <span className="text-muted-foreground font-normal"> · {resident.liaison_contact_phone}</span>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-3 py-1.5">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" /> Resident Since
                    </span>
                    <span className="font-medium">
                      {new Date(resident.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {resident.id_type && resident.id_number && (
                    <div className="flex justify-between items-center gap-3 py-1.5">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <IdCard className="h-3.5 w-3.5" /> {resident.id_type}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{resident.id_number}</span>
                        <Badge variant={resident.id_verified_at ? 'success' : 'outline'} className="text-xs">
                          {resident.id_verified_at ? 'Verified' : 'Unverified'}
                        </Badge>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-3 py-1.5">
                    <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
                      <AlertCircle className="h-3.5 w-3.5" /> Emergency Contact
                    </span>
                    {hasEmergencyContact ? (
                      <span className="font-medium text-right">
                        {resident.emergency_contact_resident ? (
                          <Link href={`/residents/${resident.emergency_contact_resident_id}`} className="inline-flex items-center gap-1 hover:underline">
                            <LinkIcon className="h-3 w-3" />
                            {resident.emergency_contact_resident.first_name} {resident.emergency_contact_resident.last_name}
                          </Link>
                        ) : (
                          resident.emergency_contact_name
                        )}
                        {(resident.emergency_contact_resident?.phone_primary || resident.emergency_contact_phone) && (
                          <span className="text-muted-foreground font-normal"> · {resident.emergency_contact_resident?.phone_primary || resident.emergency_contact_phone}</span>
                        )}
                        {resident.emergency_contact_relationship && (
                          <span className="block text-xs text-muted-foreground font-normal">{resident.emergency_contact_relationship}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">None on file</span>
                    )}
                  </div>
                </div>
                {/* Contact verification: one status line and one action */}
                <div className="flex items-center gap-2 flex-wrap pt-2 mt-2 border-t" data-testid="contact-verification">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {resident.email && (
                    <Badge variant={emailVerified ? 'success' : 'warning'} className="text-xs">
                      {emailVerified ? 'Email verified' : 'Email unverified'}
                    </Badge>
                  )}
                  {resident.phone_primary && (
                    <Badge variant={phoneVerified ? 'success' : 'warning'} className="text-xs">
                      {phoneVerified ? 'Phone verified' : 'Phone unverified'}
                    </Badge>
                  )}
                  {canVerifyResident && needsContactVerification && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto min-h-11 text-xs md:min-h-0 md:h-7"
                      onClick={() => setIsVerifyDialogOpen(true)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Verify contact
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Financial Summary (Wallet + Invoices) */}
            <CrossPropertyPaymentSummary residentId={id} walletBalance={walletBalance} className="h-full flex flex-col" />
          </div>

          <LinkedHouses resident={resident} />
        </TabsContent>

        <TabsContent value="money" className="mt-4">
          <ResidentMoneyTab resident={resident} />
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <ResidentSecurityContacts residentId={id} />
        </TabsContent>

        {canViewNotes && (
          <TabsContent value="notes" className="mt-4">
            <NotesTimeline
              entityType="resident"
              entityId={id}
              canCreate={canCreateNotes}
              canEdit={canEditNotes}
              canDelete={canDeleteNotes}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
    </PageTransition>
  );
}
