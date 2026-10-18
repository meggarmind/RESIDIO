'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { IconBox } from '@/components/ui/icon-box';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Car, Edit, Loader2, Plus, Star, Trash } from 'lucide-react';
import {
  useContactVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useSetPrimaryVehicle,
  useDeactivateVehicle,
  useCurrentUserSecurityPermissions,
} from '@/hooks/use-security';
import { toast } from 'sonner';
import type { VehicleType, VisitorVehicle } from '@/types/database';

export const VEHICLE_TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'truck', label: 'Truck' },
  { value: 'van', label: 'Van' },
  { value: 'bus', label: 'Bus' },
  { value: 'other', label: 'Other' },
];

type VehicleFormState = {
  plate_number: string;
  vehicle_type: VehicleType;
  make: string;
  model: string;
  color: string;
  is_primary: boolean;
};

const EMPTY_FORM: VehicleFormState = {
  plate_number: '',
  vehicle_type: 'car',
  make: '',
  model: '',
  color: '',
  is_primary: false,
};

export function describeVehicle(vehicle: Pick<VisitorVehicle, 'make' | 'model' | 'color' | 'vehicle_type'>) {
  const details = [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const type = VEHICLE_TYPE_OPTIONS.find((o) => o.value === vehicle.vehicle_type)?.label ?? vehicle.vehicle_type;
  return details ? `${details} (${type})` : type;
}

/**
 * Vehicles registered to a security contact (#121, user story SG-02).
 * Each control is gated on the permission its server action enforces:
 * add = register_contacts, edit/primary = update_contacts, remove = suspend_revoke.
 */
export function ContactVehiclesCard({
  contactId,
  contactActive,
}: {
  contactId: string;
  contactActive: boolean;
}) {
  const { data: permissionsData } = useCurrentUserSecurityPermissions();
  const canView = permissionsData?.permissions?.view_contacts || false;
  const canRegister = permissionsData?.permissions?.register_contacts || false;
  const canUpdate = permissionsData?.permissions?.update_contacts || false;
  const canRemove = permissionsData?.permissions?.suspend_revoke_contacts || false;

  const { data: vehicles, isLoading } = useContactVehicles(canView ? contactId : undefined);
  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const setPrimaryMutation = useSetPrimaryVehicle();
  const deactivateMutation = useDeactivateVehicle();

  const [editing, setEditing] = useState<VisitorVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VehicleFormState>(EMPTY_FORM);
  const [removing, setRemoving] = useState<VisitorVehicle | null>(null);

  if (!canView) return null;

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, is_primary: !vehicles || vehicles.length === 0 });
    setShowForm(true);
  };

  const openEdit = (vehicle: VisitorVehicle) => {
    setEditing(vehicle);
    setForm({
      plate_number: vehicle.plate_number,
      vehicle_type: vehicle.vehicle_type,
      make: vehicle.make ?? '',
      model: vehicle.model ?? '',
      color: vehicle.color ?? '',
      is_primary: vehicle.is_primary,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          plate_number: form.plate_number,
          vehicle_type: form.vehicle_type,
          make: form.make,
          model: form.model,
          color: form.color,
        });
        toast.success('Vehicle updated');
      } else {
        await createMutation.mutateAsync({
          contact_id: contactId,
          plate_number: form.plate_number,
          vehicle_type: form.vehicle_type,
          make: form.make,
          model: form.model,
          color: form.color,
          is_primary: form.is_primary,
        });
        toast.success('Vehicle registered');
      }
      setShowForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save vehicle');
    }
  };

  const handleSetPrimary = async (vehicleId: string) => {
    try {
      await setPrimaryMutation.mutateAsync(vehicleId);
      toast.success('Primary vehicle updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set primary vehicle');
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await deactivateMutation.mutateAsync(removing.id);
      toast.success('Vehicle removed');
      setRemoving(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove vehicle');
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicles
            </CardTitle>
            <CardDescription>Plates recorded against this contact at the gate</CardDescription>
          </div>
          {canRegister && contactActive && (
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Vehicle
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : vehicles && vehicles.length > 0 ? (
          <div className="space-y-3">
            {vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <IconBox color="cyan" size="sm">
                    <Car className="h-5 w-5" />
                  </IconBox>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold tracking-wider">
                        {vehicle.plate_number}
                      </span>
                      {vehicle.is_primary && <Badge variant="secondary">Primary</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{describeVehicle(vehicle)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canUpdate && !vehicle.is_primary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Set as primary"
                      aria-label={`Set ${vehicle.plate_number} as primary`}
                      onClick={() => handleSetPrimary(vehicle.id)}
                      disabled={setPrimaryMutation.isPending}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  {canUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Edit vehicle"
                      aria-label={`Edit ${vehicle.plate_number}`}
                      onClick={() => openEdit(vehicle)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Remove vehicle"
                      aria-label={`Remove ${vehicle.plate_number}`}
                      onClick={() => setRemoving(vehicle)}
                    >
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Car className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No vehicles registered</p>
          </div>
        )}
      </CardContent>

      {/* Add / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
            <DialogDescription>
              Plates are stored in upper case without spaces or dashes, and must be unique across the estate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vehicle-plate">Plate Number</Label>
                <Input
                  id="vehicle-plate"
                  className="font-mono uppercase"
                  placeholder="e.g. LAG-123-AB"
                  value={form.plate_number}
                  onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.vehicle_type}
                  onValueChange={(value) => setForm({ ...form, vehicle_type: value as VehicleType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="vehicle-make">Make</Label>
                <Input
                  id="vehicle-make"
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle-model">Model</Label>
                <Input
                  id="vehicle-model"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle-color">Colour</Label>
                <Input
                  id="vehicle-color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
              </div>
            </div>
            {!editing && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="vehicle-primary"
                  checked={form.is_primary}
                  onCheckedChange={(checked) => setForm({ ...form, is_primary: checked === true })}
                />
                <Label htmlFor="vehicle-primary">Primary vehicle</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={form.plate_number.trim().length < 2 || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Add Vehicle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Dialog */}
      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Vehicle</DialogTitle>
            <DialogDescription>
              {removing?.plate_number} will no longer be offered at check-in. Past access logs keep the plate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={deactivateMutation.isPending}>
              {deactivateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
