'use client';

import { use, useState } from 'react';
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
import { ResidentForm } from '@/components/residents/resident-form';
import { AccountStatusBadge } from '@/components/residents/status-badge';
import { GranularVerificationBadge } from '@/components/residents/contact-verification-badge';
import { useResident, useDeleteResident, useUpdateResidentStatus, useVerifyResident } from '@/hooks/use-residents';
import { useVerificationStatus } from '@/hooks/use-verification';
import { LinkedHouses } from '@/components/residents/linked-houses';
import { ResidentPayments } from '@/components/residents/resident-payments';
import { WalletBalance } from '@/components/residents/wallet-balance';
import { WalletTransactions } from '@/components/residents/wallet-transactions';
import { CrossPropertyPaymentSummary } from '@/components/residents/cross-property-payment-summary';
import { ResidentSecurityContacts } from '@/components/residents/resident-security-contacts';
import { PaymentAliases } from '@/components/residents/payment-aliases';
import { PreferencesForm } from '@/components/notifications/preferences-form';
import { AdminContactVerification } from '@/components/residents/admin-contact-verification';
import { NotesTimeline } from '@/components/notes';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Pencil, Trash2, Phone, Mail, ArrowLeft, UserCircle, Link as LinkIcon, ShieldCheck, Shield, UserCheck, Bell, StickyNote, AlertCircle, UserRoundCheck, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';

interface ResidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ResidentDetailPage({ params }: ResidentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';

  const { data: resident, isLoading, error } = useResident(id);
  const { data: verificationStatus } = useVerificationStatus(id);
  const deleteMutation = useDeleteResident();
  const updateStatusMutation = useUpdateResidentStatus();
  const verifyMutation = useVerifyResident();
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  // Notes permissions
  const { hasPermission, isLoading: authLoading } = useAuth();
  const canUpdateResident = hasPermission(PERMISSIONS.RESIDENTS_UPDATE);
  const canDeleteResident = hasPermission(PERMISSIONS.RESIDENTS_DELETE);
  const canVerifyResident = hasPermission(PERMISSIONS.RESIDENTS_VERIFY);
  const canViewNotes = hasPermission(PERMISSIONS.NOTES_VIEW);
  const canCreateNotes = hasPermission(PERMISSIONS.NOTES_CREATE);
  const canEditNotes = hasPermission(PERMISSIONS.NOTES_UPDATE);
  const canDeleteNotes = hasPermission(PERMISSIONS.NOTES_DELETE);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to archive this resident?')) return;

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
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
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
            <h1 className="text-3xl font-bold">Edit Resident</h1>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Go back">
            <Link href="/residents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                {resident.first_name} {resident.last_name}
              </h1>
              <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                {resident.resident_code}
              </span>
            </div>
            <p className="text-muted-foreground capitalize">
              {resident.resident_type} Resident
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Show verify button only if contact verification is incomplete */}
          {canVerifyResident && !(
            (resident.email ? verificationStatus?.email?.verified : true) &&
            (resident.phone_primary ? verificationStatus?.phone?.verified : true)
          ) && (
            <Button
              variant="default"
              onClick={handleVerify}
              disabled={verifyMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Verify
            </Button>
          )}
          {canUpdateResident && (
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(true)}>
              {resident.account_status === 'inactive' ? <UserRoundCheck className="mr-2 h-4 w-4" /> : <UserRoundX className="mr-2 h-4 w-4" />}
              {resident.account_status === 'inactive' ? 'Reactivate' : 'Mark inactive'}
            </Button>
          )}
          {canUpdateResident && <Button variant="outline" asChild>
            <Link href={`/residents/${id}?edit=true`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>}
          {canDeleteResident && <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Archive
          </Button>}
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="aliases">
            <UserCheck className="h-4 w-4 mr-1" />
            Aliases
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-1" />
            Security
          </TabsTrigger>
          <TabsTrigger value="emergency">
            <AlertCircle className="h-4 w-4 mr-1" />
            Emergency
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-1" />
            Notifications
          </TabsTrigger>
          {canViewNotes && (
            <TabsTrigger value="notes">
              <StickyNote className="h-4 w-4 mr-1" />
              Notes
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <AccountStatusBadge status={resident.account_status} />
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Verification</span>
                  <GranularVerificationBadge
                    emailVerifiedAt={verificationStatus?.email?.verified_at ?? null}
                    phoneVerifiedAt={verificationStatus?.phone?.verified_at ?? null}
                    hasEmail={!!resident.email}
                    hasPhone={!!resident.phone_primary}
                  />
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Phone
                  </span>
                  <span className="font-medium">{resident.phone_primary}</span>
                </div>
                {resident.phone_secondary && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Secondary Phone</span>
                      <span className="font-medium">{resident.phone_secondary}</span>
                    </div>
                  </>
                )}
                {resident.email && (
                  <>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Mail className="h-4 w-4" /> Email
                      </span>
                      <span className="font-medium">{resident.email}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Wallet Balance */}
            <WalletBalance residentId={id} />

            {/* Contact Verification - Admin */}
            <AdminContactVerification
              residentId={id}
              email={resident.email}
              phone={resident.phone_primary}
            />

            {/* House Assignments */}
            <LinkedHouses resident={resident} />

            {/* Cross-Property Payment Summary */}
            <CrossPropertyPaymentSummary residentId={id} />

            {/* Notes */}
            {resident.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{resident.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Wallet Transactions */}
          <WalletTransactions residentId={id} />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <ResidentPayments residentId={id} />
        </TabsContent>

        <TabsContent value="aliases" className="mt-6">
          <PaymentAliases
            residentId={id}
            residentName={`${resident.first_name} ${resident.last_name}`}
          />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <ResidentSecurityContacts residentId={id} />
        </TabsContent>

        <TabsContent value="emergency" className="mt-6">
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

        <TabsContent value="notifications" className="mt-6">
          <PreferencesForm residentId={id} />
        </TabsContent>

        {canViewNotes && (
          <TabsContent value="notes" className="mt-6">
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
  );
}
