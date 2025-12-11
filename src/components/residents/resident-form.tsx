'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHousesWithRoles } from '@/hooks/use-houses';
import { useCreateResident, useUpdateResident, useResidents } from '@/hooks/use-residents';
import { createResidentBaseSchema, type CreateResidentData, type ResidentFormData, requiresSponsor } from '@/lib/validators/resident';
import { toast } from 'sonner';
import type { Resident, ResidentRole, EntityType } from '@/types/database';
import { PRIMARY_ROLE_OPTIONS, SECONDARY_ROLE_OPTIONS, CORPORATE_ROLE_OPTIONS, ENTITY_TYPE_LABELS, RESIDENT_ROLE_LABELS, RESIDENT_TYPE_LABELS } from '@/types/database';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ResidentFormProps {
  resident?: Resident;
  onSuccess?: () => void;
  preselectedHouseId?: string;
}

export function ResidentForm({ resident, onSuccess, preselectedHouseId }: ResidentFormProps) {
  const router = useRouter();
  const { data: housesData, isLoading: housesLoading } = useHousesWithRoles({ limit: 100 });
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 1000 }); // Fetch all for picker
  const createMutation = useCreateResident();
  const updateMutation = useUpdateResident();

  const isEditing = !!resident;
  // Use the same schema for both create and edit - house assignment fields are optional
  const schema = createResidentBaseSchema;
  const defaultContactMode = resident?.emergency_contact_resident_id ? 'linked' : 'manual';
  const [contactMode, setContactMode] = React.useState<'manual' | 'linked'>(defaultContactMode);

  const form = useForm<CreateResidentData>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: resident?.first_name ?? '',
      last_name: resident?.last_name ?? '',
      email: resident?.email ?? '',
      phone_primary: resident?.phone_primary ?? '',
      phone_secondary: resident?.phone_secondary ?? '',
      resident_type: resident?.resident_type ?? 'primary',
      entity_type: resident?.entity_type ?? 'individual',
      company_name: resident?.company_name ?? '',
      rc_number: resident?.rc_number ?? '',
      liaison_contact_name: resident?.liaison_contact_name ?? '',
      liaison_contact_phone: resident?.liaison_contact_phone ?? '',
      emergency_contact_name: resident?.emergency_contact_name ?? '',
      emergency_contact_phone: resident?.emergency_contact_phone ?? '',
      emergency_contact_relationship: resident?.emergency_contact_relationship ?? '',
      emergency_contact_resident_id: resident?.emergency_contact_resident_id ?? undefined,
      notes: resident?.notes ?? '',
      house_id: preselectedHouseId,
      resident_role: undefined,
      move_in_date: new Date().toISOString().split('T')[0],
      sponsor_resident_id: undefined,
      is_billing_responsible: false,
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Watch fields for conditional rendering
  const residentType = form.watch('resident_type');
  const residentRole = form.watch('resident_role');
  const entityType = form.watch('entity_type');
  const selectedHouseId = form.watch('house_id');

  // Role options filtered by resident type and entity type
  const availableRoles = React.useMemo(() => {
    if (residentType === 'secondary') {
      // Secondary residents must be individuals only
      if (entityType === 'corporate') {
        return []; // Corporate entities cannot be secondary residents
      }
      return SECONDARY_ROLE_OPTIONS;
    }
    // Primary residents
    if (entityType === 'corporate') {
      // Corporate entities can only be Non-Resident Landlord or Developer
      return CORPORATE_ROLE_OPTIONS;
    }
    return PRIMARY_ROLE_OPTIONS;
  }, [residentType, entityType]);

  // Reset role when resident type changes
  React.useEffect(() => {
    const currentRole = form.getValues('resident_role');
    const validRoles = availableRoles.map(r => r.value);
    if (currentRole && !validRoles.includes(currentRole as typeof validRoles[number])) {
      form.setValue('resident_role', undefined);
    }
    // Clear move-in date for secondary residents
    if (residentType === 'secondary') {
      form.setValue('move_in_date', undefined);
    }
    // Clear sponsor when switching to primary type
    if (residentType === 'primary') {
      form.setValue('sponsor_resident_id', undefined);
    }
  }, [residentType, availableRoles, form]);

  // Clear corporate fields when entity type changes away from corporate
  React.useEffect(() => {
    if (entityType !== 'corporate') {
      form.setValue('company_name', '');
      form.setValue('rc_number', '');
      form.setValue('liaison_contact_name', '');
      form.setValue('liaison_contact_phone', '');
    }
  }, [entityType, form]);

  async function onSubmit(data: CreateResidentData) {
    try {
      if (isEditing) {
        const updateData: ResidentFormData = {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone_primary: data.phone_primary,
          phone_secondary: data.phone_secondary,
          resident_type: data.resident_type,
          entity_type: data.entity_type,
          company_name: data.company_name,
          rc_number: data.rc_number,
          liaison_contact_name: data.liaison_contact_name,
          liaison_contact_phone: data.liaison_contact_phone,
          emergency_contact_name: data.emergency_contact_name,
          emergency_contact_phone: data.emergency_contact_phone,
          emergency_contact_relationship: data.emergency_contact_relationship,
          emergency_contact_resident_id: data.emergency_contact_resident_id,
          notes: data.notes,
        };
        await updateMutation.mutateAsync({ id: resident.id, data: updateData });
        toast.success('Resident updated successfully');
      } else {
        await createMutation.mutateAsync(data);
        toast.success('Resident created successfully');
      }
      onSuccess?.();
      router.push('/residents');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  }

  // Filter houses based on selected role
  const allHouses = housesData?.data ?? [];
  const availableHouses = React.useMemo(() => {
    if (!residentRole) {
      return allHouses;
    }
    // For resident_landlord and tenant, filter out houses that already have one
    if (residentRole === 'resident_landlord' || residentRole === 'tenant') {
      return allHouses.filter(house =>
        !house.activeRoles.includes('resident_landlord' as ResidentRole) &&
        !house.activeRoles.includes('tenant' as ResidentRole)
      );
    }
    return allHouses;
  }, [allHouses, residentRole]);

  const otherResidents = residentsData?.data.filter(r => r.id !== resident?.id) ?? [];

  // Get sponsors (primary residents of selected house) for domestic_staff and caretaker
  const availableSponsors = React.useMemo(() => {
    if (!selectedHouseId || !residentRole || !requiresSponsor(residentRole as ResidentRole)) {
      return [];
    }
    // Filter residents who are non_resident_landlord, resident_landlord, or tenant of the selected house
    return otherResidents.filter(r => {
      // Check if resident has an active primary role in the selected house
      const residentWithHouses = r as Resident & { resident_houses?: Array<{ house_id: string; resident_role: ResidentRole; is_active: boolean }> };
      return residentWithHouses.resident_houses?.some(
        rh => rh.house_id === selectedHouseId &&
              rh.is_active &&
              ['non_resident_landlord', 'resident_landlord', 'tenant'].includes(rh.resident_role)
      );
    });
  }, [selectedHouseId, residentRole, otherResidents]);

  // Clear house selection when role changes and house has conflicts
  React.useEffect(() => {
    const currentHouseId = form.getValues('house_id');
    if (currentHouseId && (residentRole === 'resident_landlord' || residentRole === 'tenant')) {
      const selectedHouse = allHouses.find(h => h.id === currentHouseId);
      if (selectedHouse?.activeRoles.includes('resident_landlord' as ResidentRole) ||
          selectedHouse?.activeRoles.includes('tenant' as ResidentRole)) {
        form.setValue('house_id', undefined);
      }
    }
    // Clear sponsor when role changes to non-sponsor-required
    if (residentRole && !requiresSponsor(residentRole as ResidentRole)) {
      form.setValue('sponsor_resident_id', undefined);
    }
  }, [residentRole, allHouses, form]);

  // Determine if sponsor selection should be shown
  const showSponsorField = residentRole && requiresSponsor(residentRole as ResidentRole);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Personal Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Personal Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone_primary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Phone *</FormLabel>
                  <FormControl>
                    <Input placeholder="08012345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone_secondary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="resident_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resident Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="primary">{RESIDENT_TYPE_LABELS.primary}</SelectItem>
                      <SelectItem value="secondary" disabled={entityType === 'corporate'}>
                        {RESIDENT_TYPE_LABELS.secondary}
                        {entityType === 'corporate' && ' (Not available for Corporate)'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Entity Type */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Entity Type</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="entity_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entity Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select entity type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Individual for persons, Corporate for companies
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Corporate-specific fields */}
            {entityType === 'corporate' && (
              <>
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Corporation Ltd" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rc_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RC Number</FormLabel>
                      <FormControl>
                        <Input placeholder="RC123456" {...field} />
                      </FormControl>
                      <FormDescription>Company registration number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="liaison_contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liaison Contact Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Contact person name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="liaison_contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Liaison Contact Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="08012345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
        </div>

        {/* House Assignment (only for new residents) */}
        {!isEditing && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">House Assignment</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="resident_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableRoles.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {residentType === 'secondary'
                        ? 'Secondary residents include co-residents, household members, and staff'
                        : entityType === 'corporate'
                          ? 'Corporate entities can only be Non-Resident Landlord or Developer'
                          : 'Primary residents are landlords (resident or non-resident), tenants, or developers'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="house_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>House</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={housesLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a house" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableHouses.map((house) => {
                          const hasResidentLandlord = house.activeRoles.includes('resident_landlord' as ResidentRole);
                          const hasTenant = house.activeRoles.includes('tenant' as ResidentRole);
                          const hasNonResidentLandlord = house.activeRoles.includes('non_resident_landlord' as ResidentRole);
                          const hasDeveloper = house.activeRoles.includes('developer' as ResidentRole);
                          let status = '';
                          if (hasResidentLandlord) status = ' (Owner-Occupied)';
                          else if (hasNonResidentLandlord && hasTenant) status = ' (Tenanted)';
                          else if (hasNonResidentLandlord) status = ' (Vacant - Landlord assigned)';
                          else if (hasDeveloper) status = ' (Developer Inventory)';
                          else if (house.is_occupied) status = ' (Occupied)';

                          return (
                            <SelectItem key={house.id} value={house.id}>
                              {house.house_number} {house.street?.name}
                              {status}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optional - can be assigned later
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Move-in date only shown for primary residents */}
              {residentType === 'primary' && (
                <FormField
                  control={form.control}
                  name="move_in_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Move-in Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Sponsor selection for domestic_staff and caretaker */}
              {showSponsorField && (
                <FormField
                  control={form.control}
                  name="sponsor_resident_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sponsor *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                        disabled={!selectedHouseId || availableSponsors.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={
                              !selectedHouseId
                                ? "Select a house first"
                                : availableSponsors.length === 0
                                  ? "No sponsors available"
                                  : "Select a sponsor"
                            } />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableSponsors.map((sponsor) => (
                            <SelectItem key={sponsor.id} value={sponsor.id}>
                              {sponsor.first_name} {sponsor.last_name} ({sponsor.resident_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {RESIDENT_ROLE_LABELS[residentRole as ResidentRole]} must be sponsored by a Resident Landlord, Non-Resident Landlord, or Tenant of the same house
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
        )}

        {/* Emergency Contact */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Emergency Contact</h3>
            <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as 'manual' | 'linked')}>
              <TabsList>
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="linked">Link Resident</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {contactMode === 'manual' ? (
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="emergency_contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emergency_contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact phone" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emergency_contact_relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Spouse, Parent" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="emergency_contact_resident_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Resident</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={residentsLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a resident" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {otherResidents.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.first_name} {r.last_name} ({r.resident_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emergency_contact_relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Spouse" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional notes about this resident..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : isEditing ? 'Update Resident' : 'Create Resident'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
