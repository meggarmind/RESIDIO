'use client';

import { use, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ResidentForm } from '@/components/residents/resident-form';
import { AccountStatusBadge } from '@/components/residents/status-badge';
import { GranularVerificationBadge } from '@/components/residents/contact-verification-badge';
import { useResident, useDeleteResident, useUpdateResidentStatus, useVerifyResident } from '@/hooks/use-residents';
import { useVerificationStatus, useAdminVerifyContact } from '@/hooks/use-verification';
import { useWallet } from '@/hooks/use-wallet';
import { formatCurrency } from '@/lib/utils';
import { LinkedHouses } from '@/components/residents/linked-houses';
import { ResidentPayments } from '@/components/residents/resident-payments';
import { WalletTransactions } from '@/components/residents/wallet-transactions';
import { CrossPropertyPaymentSummary } from '@/components/residents/cross-property-payment-summary';
import { ResidentSecurityContacts } from '@/components/residents/resident-security-contacts';
import { PaymentAliases } from '@/components/residents/payment-aliases';
import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';
import { PreferencesForm } from '@/components/notifications/preferences-form';
import { NotesTimeline } from '@/components/notes';
import { ShimmerCard } from '@/components/ui/shimmer-skeleton';
import { PageTransition } from '@/components/ui/page-transition';
import { IconBox } from '@/components/ui/icon-box';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Pencil, Trash2, Phone, Mail, ArrowLeft, UserCircle, Link as LinkIcon, ShieldCheck, Shield, UserCheck, Bell, StickyNote, AlertCircle, UserRoundCheck, UserRoundX, Wallet, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ResidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ResidentDetailPage({ params }: ResidentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';
  const tabParam = searchParams.get('tab');

  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    router.replace(`/residents/${id}?${params.toString()}`, { scroll: false });
    setTimeout(() => {
      const panel = document.querySelector(`[data-tab-panel="${value}"]`) as HTMLElement | null;
      panel?.focus({ preventScroll: true });
    }, 50);
  }, [searchParams, router, id]);

  const { data: resident, isLoading, error } = useResident(id);
  const { data: verificationStatus } = useVerificationStatus(id);
  const deleteMutation = useDeleteResident();
  const updateStatusMutation = useUpdateResidentStatus();
  const verifyMutation = useVerifyResident();
  const adminVerify = useAdminVerifyContact();
  const { data: walletData } = useWallet(id);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);

  // Notes permissions
  const { hasPermission, isLoading: authLoading } = useAuth();
  const canUpdateResident = hasPermission(PERMISSIONS.RESIDENTS_UPDATE);
  const canDeleteResident = hasPermission(PERMISSIONS.RESIDENTS_DELETE);
  const canVerifyResident = hasPermission(PERMISSIONS.RESIDENTS_VERIFY);
  const canViewNotes = hasPermission(PERMISSIONS.NOTES_VIEW);
  const canCreateNotes = hasPermission(PERMISSIONS.NOTES_CREATE);
  const canEditNotes = hasPermission(PERMISSIONS.NOTES_UPDATE);
  const canDeleteNotes = hasPermission(PERMISSIONS.NOTES_DELETE);

  const wallet = walletData?.data;
  const walletBalance = wallet?.balance || 0;
  const walletBalanceColor = walletBalance > 0 ? 'text-green-600 dark:text-green-400' : walletBalance < 0 ? 'text-red-600 dark:text-red-400' : '';
  const emailVerified = verificationStatus?.email?.verified;
  const phoneVerified = verificationStatus?.phone?.verified;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Resident archived successfully');
      router.push('/residents');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive resident');
    }
  };

  const handleVerify = async () => {
    if (!confirm('Are you sure you want to verify this resident?')) return;

    try {
      await verifyMutation.mutateAsync(id);
      toast.success('Resident verified successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to verify resident');
    }
  };

  const handleAdminVerifyContact = async (contactType: 'email' | 'phone') => {
    try {
      await adminVerify.mutateAsync({ residentId: id, contactType });
      toast.success(`${contactType === 'email' ? 'Email' : 'Phone'} verified successfully`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to verify ${contactType}`);
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
      <div className="space-y-4">
        <div className="flex items-center gap-x-3 gap-y-2">
          <div className="h-8 w-8 rounded-md bg-muted" />
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-5 w-24 rounded bg-muted" />
        </div>
        <div className="flex gap-1.5 h-9 p-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded bg-muted" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ShimmerCard />
          <ShimmerCard />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ShimmerCard />
          <ShimmerCard />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ShimmerCard />
          <ShimmerCard />
        </div>
        <ShimmerCard />
      </div>
    );
  }

  if (error || !resident) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Resident not found</p>
        <Button variant="outline" asChild>
          <Link href="/residents">Back to Residents</Link>
        </Button>
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

  return (
    <PageTransition>
    <div className="space-y-4">
      {/* Compact header bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild aria-label="Go back">
          <Link href="/residents">
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
          {canVerifyResident && !(
            (resident.email ? verificationStatus?.email?.verified : true) &&
            (resident.phone_primary ? verificationStatus?.phone?.verified : true)
          ) && (
            <Button
              size="sm"
              variant="default"
              onClick={handleVerify}
              disabled={verifyMutation.isPending}
              className="h-8 text-xs"
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Verify
            </Button>
          )}
          {canUpdateResident && (
            <Button variant="outline" size="sm" onClick={() => setIsStatusDialogOpen(true)} className="h-8 text-xs">
              {resident.account_status === 'inactive' ? <UserRoundCheck className="mr-1.5 h-3.5 w-3.5" /> : <UserRoundX className="mr-1.5 h-3.5 w-3.5" />}
              {resident.account_status === 'inactive' ? 'Reactivate' : 'Inactivate'}
            </Button>
          )}
          {canUpdateResident && (
            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
              <Link href={`/residents/${id}?edit=true`}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Link>
            </Button>
          )}
          {canDeleteResident && (
            <Button variant="destructive" size="sm" onClick={() => setIsArchiveDialogOpen(true)} disabled={deleteMutation.isPending} className="h-8 text-xs">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </Button>
          )}
        </div>
      </div>

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

      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this resident?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the resident from the active roster and unlink their house assignments.
              Payment history and audit trails are preserved for record-keeping.
              This action cannot be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive Resident
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue={tabParam ?? 'overview'} className="w-full" onValueChange={handleTabChange}>
        <TabsList className="h-9 p-1 sticky top-0 z-10 glass">
          <TabsTrigger value="overview" className="text-xs h-7">Overview</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs h-7">
            <Wallet className="h-3.5 w-3.5 mr-1" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs h-7">Payments</TabsTrigger>
          <TabsTrigger value="aliases" className="text-xs h-7">
            <UserCheck className="h-3.5 w-3.5 mr-1" />
            Aliases
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs h-7">
            <Shield className="h-3.5 w-3.5 mr-1" />
            Security
          </TabsTrigger>
          <TabsTrigger value="emergency" className="text-xs h-7">
            <AlertCircle className="h-3.5 w-3.5 mr-1" />
            Emergency
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs h-7">
            <Bell className="h-3.5 w-3.5 mr-1" />
            Notifications
          </TabsTrigger>
          {canViewNotes && (
            <TabsTrigger value="notes" className="text-xs h-7">
              <StickyNote className="h-3.5 w-3.5 mr-1" />
              Notes
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-6" role="tabpanel" tabIndex={0} data-tab-panel="overview">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
            }}
          >
            {/* Top row: Identity + Wallet / Invoices */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Identity & Contact + Wallet Balance */}
              <motion.div
                className="h-full"
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}
              >
                <Card className="card-hover-modern h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <IconBox color="blue" size="sm">
                        <UserCircle className="h-4 w-4" />
                      </IconBox>
                      Identity &amp; Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" /> Phone
                      </span>
                      <span className="font-medium">{resident.phone_primary}</span>
                    </div>
                    {resident.phone_secondary && (
                      <>
                        <Separator />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Secondary Phone</span>
                          <span className="font-medium">{resident.phone_secondary}</span>
                        </div>
                      </>
                    )}
                    {resident.email && (
                      <>
                        <Separator />
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" /> Email
                          </span>
                          <span className="font-medium">{resident.email}</span>
                        </div>
                      </>
                    )}
                    <Separator />
                    <div className="py-1">
                      <p className="text-xs text-muted-foreground mb-0.5">Wallet Balance</p>
                      <p className={`text-xl font-bold ${walletBalanceColor}`}>
                        {formatCurrency(walletBalance)}
                      </p>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2 flex-wrap">
                      <GranularVerificationBadge
                        emailVerifiedAt={verificationStatus?.email?.verified_at ?? null}
                        phoneVerifiedAt={verificationStatus?.phone?.verified_at ?? null}
                        hasEmail={!!resident.email}
                        hasPhone={!!resident.phone_primary}
                      />
                      {resident.email && !emailVerified && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAdminVerifyContact('email')} disabled={adminVerify.isPending}>
                          {adminVerify.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          <Mail className="h-3 w-3 mr-1" />
                          Verify Email
                        </Button>
                      )}
                      {!phoneVerified && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAdminVerifyContact('phone')} disabled={adminVerify.isPending}>
                          {adminVerify.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          <Phone className="h-3 w-3 mr-1" />
                          Verify Phone
                        </Button>
                      )}
                      {emailVerified && resident.email && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Email verified
                        </Badge>
                      )}
                      {phoneVerified && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Phone verified
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Invoices (Outstanding Balance) */}
              <motion.div
                className="h-full"
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}
              >
                <Card className="card-hover-modern h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <IconBox color="green" size="sm">
                        <Wallet className="h-4 w-4" />
                      </IconBox>
                      Invoices
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CrossPropertyPaymentSummary residentId={id} />
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Housing — multi-column grid */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }}
            >
              <LinkedHouses resident={resident} />
            </motion.div>
          </motion.div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="transactions">
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-modern">
            <WalletTransactions residentId={id} />
          </div>
          <WalletPaymentBatchTools
            residentId={id}
            houses={((resident.resident_houses ?? []) as Array<{
              house: {
                id: string;
                house_number: string;
                street?: { name?: string | null; short_name?: string | null } | null;
              };
            }>).filter((assignment) => assignment.house?.id).map((assignment) => ({
              id: assignment.house.id,
              label: `${assignment.house.street?.short_name || assignment.house.street?.name || ''}-${assignment.house.house_number}`,
            }))}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="payments">
          <ResidentPayments residentId={id} />
        </TabsContent>

        <TabsContent value="aliases" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="aliases">
          <PaymentAliases
            residentId={id}
            residentName={`${resident.first_name} ${resident.last_name}`}
          />
        </TabsContent>

        <TabsContent value="security" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="security">
          <ResidentSecurityContacts residentId={id} />
        </TabsContent>

        <TabsContent value="emergency" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="emergency">
          <div className="max-w-2xl">
            {resident.emergency_contact_name || resident.emergency_contact_phone || resident.emergency_contact_resident ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {resident.emergency_contact_resident ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Linked Resident</span>
                        <Link href={`/residents/${resident.emergency_contact_resident_id}`} className="font-medium hover:underline flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" />
                          {resident.emergency_contact_resident.first_name} {resident.emergency_contact_resident.last_name}
                        </Link>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone</span>
                        <span className="font-medium">{resident.emergency_contact_resident.phone_primary}</span>
                      </div>
                      {resident.emergency_contact_relationship && (
                        <>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Relationship</span>
                            <span className="font-medium">{resident.emergency_contact_relationship}</span>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {resident.emergency_contact_name && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name</span>
                          <span className="font-medium">{resident.emergency_contact_name}</span>
                        </div>
                      )}
                      {resident.emergency_contact_phone && (
                        <>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Phone</span>
                            <span className="font-medium">{resident.emergency_contact_phone}</span>
                          </div>
                        </>
                      )}
                      {resident.emergency_contact_relationship && (
                        <>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Relationship</span>
                            <span className="font-medium">{resident.emergency_contact_relationship}</span>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No emergency contact on file</p>
                  <p className="text-sm mt-1">An emergency contact can be added from the Edit Resident form.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="notifications">
          <PreferencesForm residentId={id} />
        </TabsContent>

        {canViewNotes && (
          <TabsContent value="notes" className="mt-6" role="tabpanel" tabIndex={0} data-tab-panel="notes">
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
