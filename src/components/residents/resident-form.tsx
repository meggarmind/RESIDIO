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
import { useHouses } from '@/hooks/use-houses';
import { useCreateResident, useUpdateResident, useResidents } from '@/hooks/use-residents';
import { createResidentSchema, residentFormSchema, type CreateResidentData, type ResidentFormData } from '@/lib/validators/resident';
import { toast } from 'sonner';
import type { Resident } from '@/types/database';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ResidentFormProps {
  resident?: Resident;
  onSuccess?: () => void;
}

export function ResidentForm({ resident, onSuccess }: ResidentFormProps) {
  const router = useRouter();
  const { data: housesData, isLoading: housesLoading } = useHouses({ limit: 100 });
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 1000 }); // Fetch all for picker
  const createMutation = useCreateResident();
  const updateMutation = useUpdateResident();

  const isEditing = !!resident;
  const schema = isEditing ? residentFormSchema : createResidentSchema;
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
      emergency_contact_name: resident?.emergency_contact_name ?? '',
      emergency_contact_phone: resident?.emergency_contact_phone ?? '',
      emergency_contact_relationship: resident?.emergency_contact_relationship ?? '',
      emergency_contact_resident_id: resident?.emergency_contact_resident_id ?? undefined,
      notes: resident?.notes ?? '',
      house_id: undefined,
      resident_role: undefined,
      move_in_date: new Date().toISOString().split('T')[0],
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

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

  const availableHouses = housesData?.data.filter((h) => !h.is_occupied) ?? [];
  const otherResidents = residentsData?.data.filter(r => r.id !== resident?.id) ?? [];

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
                      <SelectItem value="primary">Primary (Head of household)</SelectItem>
                      <SelectItem value="secondary">Secondary (Family member)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* House Assignment (only for new residents) */}
        {!isEditing && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">House Assignment</h3>
            <div className="grid gap-4 md:grid-cols-3">
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
                        {availableHouses.map((house) => (
                          <SelectItem key={house.id} value={house.id}>
                            {house.house_number} {house.street?.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {availableHouses.length === 0 && !housesLoading
                        ? 'No vacant houses available'
                        : 'Optional - can be assigned later'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="resident_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="tenant">Tenant</SelectItem>
                        <SelectItem value="occupier">Occupier</SelectItem>
                        <SelectItem value="family_member">Household Member</SelectItem>
                        <SelectItem value="domestic_staff">Domestic Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
