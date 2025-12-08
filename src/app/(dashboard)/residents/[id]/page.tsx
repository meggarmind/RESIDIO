'use client';

import { use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ResidentForm } from '@/components/residents/resident-form';
import { AccountStatusBadge, VerificationStatusBadge } from '@/components/residents/status-badge';
import { useResident, useDeleteResident, useVerifyResident } from '@/hooks/use-residents';
import { LinkedHouses } from '@/components/residents/linked-houses';
import { ResidentPayments } from '@/components/residents/resident-payments';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Pencil, Trash2, Phone, Mail, ArrowLeft, UserCircle, Link as LinkIcon, ShieldCheck, CreditCard } from 'lucide-react';
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
  const deleteMutation = useDeleteResident();
  const verifyMutation = useVerifyResident();

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

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
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
          <Button variant="ghost" size="icon" asChild>
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
          {resident.verification_status !== 'verified' && (
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
          <Button variant="outline" asChild>
            <Link href={`/residents/${id}?edit=true`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Archive
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
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
                  <VerificationStatusBadge status={resident.verification_status} />
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

            {/* House Assignments */}
            <LinkedHouses resident={resident} />

            {/* Emergency Contact */}
            {(resident.emergency_contact_name || resident.emergency_contact_phone || resident.emergency_contact_resident) && (
              <Card>
                <CardHeader>
                  <CardTitle>Emergency Contact</CardTitle>
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
            )}

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
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <ResidentPayments residentId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
