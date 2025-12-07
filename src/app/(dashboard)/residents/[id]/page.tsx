'use client';

import { use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ResidentForm } from '@/components/residents/resident-form';
import { AccountStatusBadge, VerificationStatusBadge } from '@/components/residents/status-badge';
import { useResident, useDeleteResident } from '@/hooks/use-residents';
import { Users, Pencil, Trash2, Home, Phone, Mail, ArrowLeft, UserCircle } from 'lucide-react';
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

  const activeHouses = resident.resident_houses?.filter((rh) => rh.is_active) ?? [];

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              House Assignments ({activeHouses.length})
            </CardTitle>
            <CardDescription>Properties linked to this resident</CardDescription>
          </CardHeader>
          <CardContent>
            {activeHouses.length === 0 ? (
              <p className="text-muted-foreground text-sm">No house assignments</p>
            ) : (
              <div className="space-y-4">
                {activeHouses.map((rh) => (
                  <div key={rh.id} className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/houses/${rh.house.id}`}
                        className="font-medium hover:underline"
                      >
                        {rh.house?.house_number} {rh.house?.street?.name}
                      </Link>
                      <p className="text-sm text-muted-foreground capitalize">
                        {rh.resident_role.replace('_', ' ')}
                        {rh.is_primary && ' (Primary)'}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Since {new Date(rh.move_in_date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        {(resident.emergency_contact_name || resident.emergency_contact_phone) && (
          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
    </div>
  );
}
