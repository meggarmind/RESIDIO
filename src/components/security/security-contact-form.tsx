'use client';

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
import {
  useCreateSecurityContact,
  useUpdateSecurityContact,
  useSecurityContactCategories,
} from '@/hooks/use-security';
import { useResidents } from '@/hooks/use-residents';
import { createSecurityContactSchema, type CreateSecurityContactData, type UpdateSecurityContactData } from '@/lib/validators/security-contact';
import { toast } from 'sonner';
import type { SecurityContactWithDetails, IdDocumentType } from '@/types/database';
import { ID_DOCUMENT_TYPE_LABELS } from '@/types/database';
import { Loader2 } from 'lucide-react';

interface SecurityContactFormProps {
  contact?: SecurityContactWithDetails;
  residentId?: string;
  preselectedResidentId?: string;
  residentName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SecurityContactForm({
  contact,
  residentId,
  preselectedResidentId,
  residentName,
  onSuccess,
  onCancel,
}: SecurityContactFormProps) {
  // Use preselectedResidentId if residentId is not provided
  const effectiveResidentId = residentId || preselectedResidentId;
  const router = useRouter();
  const isEditing = !!contact;

  // Fetch data
  const { data: categories, isLoading: categoriesLoading } = useSecurityContactCategories();
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 500 });
  const residents = residentsData?.data || [];

  // Mutations
  const createMutation = useCreateSecurityContact();
  const updateMutation = useUpdateSecurityContact();

  const form = useForm<CreateSecurityContactData>({
    resolver: zodResolver(createSecurityContactSchema),
    defaultValues: {
      resident_id: effectiveResidentId || contact?.resident_id || '',
      category_id: contact?.category_id || '',
      full_name: contact?.full_name || '',
      phone_primary: contact?.phone_primary || '',
      phone_secondary: contact?.phone_secondary || '',
      id_type: contact?.id_type || undefined,
      id_number: contact?.id_number || '',
      address: contact?.address || '',
      next_of_kin_name: contact?.next_of_kin_name || '',
      next_of_kin_phone: contact?.next_of_kin_phone || '',
      employer: contact?.employer || '',
      relationship: contact?.relationship || '',
      notes: contact?.notes || '',
    },
  });

  const selectedCategoryId = form.watch('category_id');
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

  async function onSubmit(data: CreateSecurityContactData) {
    try {
      if (isEditing && contact) {
        await updateMutation.mutateAsync({
          id: contact.id,
          ...data,
        } as UpdateSecurityContactData);
        toast.success('Security contact updated');
      } else {
        await createMutation.mutateAsync(data);
        toast.success('Security contact created');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/security/contacts');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save security contact');
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Resident Selection */}
        {!effectiveResidentId && (
          <FormField
            control={form.control}
            name="resident_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resident *</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isEditing}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select resident" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {residentsLoading ? (
                      <SelectItem value="_loading" disabled>
                        Loading residents...
                      </SelectItem>
                    ) : residents.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        No residents found
                      </SelectItem>
                    ) : (
                      residents.map((resident) => (
                        <SelectItem key={resident.id} value={resident.id}>
                          {resident.first_name} {resident.last_name} ({resident.resident_code})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {effectiveResidentId && (
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">Registering contact for:</p>
            <p className="font-medium">
              {residentName || residents.find(r => r.id === effectiveResidentId)?.first_name} {residentName ? '' : residents.find(r => r.id === effectiveResidentId)?.last_name}
            </p>
          </div>
        )}

        {/* Category Selection */}
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categoriesLoading ? (
                    <SelectItem value="_loading" disabled>
                      Loading categories...
                    </SelectItem>
                  ) : (
                    categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedCategory && (
                <FormDescription>
                  Default validity: {selectedCategory.default_validity_days} days (max: {selectedCategory.max_validity_days} days)
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter full name" {...field} />
                </FormControl>
                <FormDescription>As it appears on ID document</FormDescription>
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
        </div>

        <FormField
          control={form.control}
          name="phone_secondary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Secondary Phone</FormLabel>
              <FormControl>
                <Input placeholder="08012345678" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Identification */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Identification (Optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="id_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ID type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(ID_DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              name="id_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID Number</FormLabel>
                  <FormControl>
                    <Input placeholder="ID document number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Address */}
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Contact's home address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Context-specific fields based on category */}
        {selectedCategory?.name === 'Service Provider' && (
          <FormField
            control={form.control}
            name="employer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company / Employer</FormLabel>
                <FormControl>
                  <Input placeholder="Company name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {selectedCategory?.name === 'Visitor' && (
          <FormField
            control={form.control}
            name="relationship"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Relationship to Resident</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Brother, Business Partner" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Next of Kin */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Next of Kin (Optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="next_of_kin_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Next of kin name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="next_of_kin_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="08012345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes or instructions" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Update Contact' : 'Create Contact'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
