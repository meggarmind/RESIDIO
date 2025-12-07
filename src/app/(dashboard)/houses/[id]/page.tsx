'use client';

import { use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { HouseForm } from '@/components/houses/house-form';
import { OccupancyBadge, AccountStatusBadge } from '@/components/residents/status-badge';
import { useHouse, useDeleteHouse } from '@/hooks/use-houses';
import { Home, Pencil, Trash2, Users, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface HouseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function HouseDetailPage({ params }: HouseDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';

  const { data: house, isLoading, error } = useHouse(id);
  const deleteMutation = useDeleteHouse();

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this house?')) return;

    try {
      await deleteMutation.mutateAsync(id);
      toast.success('House deleted successfully');
      router.push('/houses');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete house');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !house) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">House not found</p>
        <Button variant="outline" asChild>
          <Link href="/houses">Back to Houses</Link>
        </Button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/houses/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit House</h1>
            <p className="text-muted-foreground">Update property details.</p>
          </div>
        </div>

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

  const activeResidents = house.resident_houses?.filter(rh => rh.is_active) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/houses">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {house.house_number} {house.street?.name}
            </h1>
            <p className="text-muted-foreground">
              {house.house_type?.name ?? 'No type specified'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/houses/${id}?edit=true`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending || activeResidents.length > 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Property Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">House Number</span>
              <span className="font-medium">{house.house_number}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Street</span>
              <span className="font-medium">{house.street?.name}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{house.house_type?.name ?? '-'}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <OccupancyBadge isOccupied={house.is_occupied} />
            </div>
            {house.notes && (
              <>
                <Separator />
                <div>
                  <span className="text-muted-foreground block mb-2">Notes</span>
                  <p className="text-sm">{house.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Residents ({activeResidents.length})
            </CardTitle>
            <CardDescription>
              People currently living at this property
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeResidents.length === 0 ? (
              <p className="text-muted-foreground text-sm">No residents assigned</p>
            ) : (
              <div className="space-y-4">
                {activeResidents.map((rh) => (
                  <div key={rh.id} className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/residents/${rh.resident.id}`}
                        className="font-medium hover:underline"
                      >
                        {rh.resident.first_name} {rh.resident.last_name}
                      </Link>
                      <p className="text-sm text-muted-foreground capitalize">
                        {rh.resident_role.replace('_', ' ')}
                      </p>
                    </div>
                    <AccountStatusBadge status={rh.resident.account_status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
