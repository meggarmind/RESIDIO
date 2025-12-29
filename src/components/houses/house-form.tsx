'use client';

import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { useStreets, useHouseTypes } from '@/hooks/use-reference';
import { useCreateHouse, useUpdateHouse } from '@/hooks/use-houses';
import { useBillingProfiles } from '@/hooks/use-billing';
import { houseFormSchema, type HouseFormData } from '@/lib/validators/house';
import { toast } from 'sonner';
import type { House } from '@/types/database';
import { Sparkles } from 'lucide-react';

const NONE_VALUE = '_none';

/**
 * Generate a property shortname from street code and house number
 * Format: STREET_CODE-HOUSE_NUMBER (e.g., OAK-10A)
 */
function generateShortname(streetShortName: string | null | undefined, houseNumber: string): string {
  if (!streetShortName || !houseNumber) return '';
  return `${streetShortName.toUpperCase()}-${houseNumber.toUpperCase()}`;
}

interface HouseFormProps {
  house?: House;
  onSuccess?: () => void;
}

export function HouseForm({ house, onSuccess }: HouseFormProps) {
  const router = useRouter();
  const { data: streets, isLoading: streetsLoading } = useStreets();
  const { data: houseTypes, isLoading: typesLoading } = useHouseTypes();
  const { data: billingProfiles, isLoading: profilesLoading } = useBillingProfiles();
  const createMutation = useCreateHouse();
  const updateMutation = useUpdateHouse();

  const form = useForm<HouseFormData>({
    resolver: zodResolver(houseFormSchema),
    defaultValues: {
      house_number: house?.house_number ?? '',
      street_id: house?.street_id ?? '',
      house_type_id: house?.house_type_id ?? '',
      address_line_2: house?.address_line_2 ?? '',
      short_name: house?.short_name ?? '',
      notes: house?.notes ?? '',
      date_added_to_portal: '', // Set on client side to avoid hydration mismatch
      billing_profile_id: house?.billing_profile_id ?? '',
      number_of_plots: house?.number_of_plots ?? 1,
    },
  });

  // Watch for changes to street and house number to auto-generate shortname
  const watchedStreetId = useWatch({ control: form.control, name: 'street_id' });
  const watchedHouseNumber = useWatch({ control: form.control, name: 'house_number' });
  const watchedShortName = useWatch({ control: form.control, name: 'short_name' });

  // Get the selected street's short_name
  const selectedStreet = useMemo(() => {
    return streets?.find(s => s.id === watchedStreetId);
  }, [streets, watchedStreetId]);

  // Auto-generate shortname when street or house number changes (only if not manually edited)
  const suggestedShortname = useMemo(() => {
    return generateShortname(selectedStreet?.short_name, watchedHouseNumber);
  }, [selectedStreet?.short_name, watchedHouseNumber]);

  // Set today's date on client side only to avoid hydration mismatch
  useEffect(() => {
    if (!house) {
      form.setValue('date_added_to_portal', new Date().toISOString().split('T')[0]);
    }
  }, [house, form]);

  // Auto-fill shortname when it's empty and we have a suggestion
  useEffect(() => {
    // Only auto-fill for new houses or if shortname is empty
    if (!watchedShortName && suggestedShortname) {
      form.setValue('short_name', suggestedShortname);
    }
  }, [suggestedShortname, watchedShortName, form]);

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Check if user has manually modified the shortname
  const isShortNameManuallyEdited = watchedShortName !== suggestedShortname && watchedShortName !== '';

  async function onSubmit(data: HouseFormData) {
    try {
      if (house) {
        await updateMutation.mutateAsync({ id: house.id, data });
        // Toast is now handled in the hook
      } else {
        await createMutation.mutateAsync(data);
        toast.success('House created successfully');
      }
      onSuccess?.();
      router.push('/houses');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    }
  }

  // Reset shortname to suggested value
  const handleResetShortname = () => {
    form.setValue('short_name', suggestedShortname);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="house_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>House Number *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 1, 10A, B2" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="street_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street *</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={streetsLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a street" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {streets?.map((street) => (
                      <SelectItem key={street.id} value={street.id}>
                        {street.name}
                        {street.short_name && (
                          <span className="ml-2 text-muted-foreground">
                            ({street.short_name})
                          </span>
                        )}
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
            name="short_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  Property Shortname
                  {suggestedShortname && !isShortNameManuallyEdited && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-normal">
                      <Sparkles className="h-3 w-3" />
                      Auto-generated
                    </span>
                  )}
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder={suggestedShortname || 'e.g., OAK-10A'}
                      {...field}
                      className={isShortNameManuallyEdited ? '' : 'text-muted-foreground'}
                    />
                  </FormControl>
                  {isShortNameManuallyEdited && suggestedShortname && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetShortname}
                      className="shrink-0"
                    >
                      Reset
                    </Button>
                  )}
                </div>
                <FormDescription>
                  {selectedStreet?.short_name
                    ? `Auto-generated from street code "${selectedStreet.short_name}" + house number. You can edit it.`
                    : 'Set a street code in street settings to enable auto-generation.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="house_type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>House Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={typesLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {houseTypes?.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
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
            name="address_line_2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address Line 2</FormLabel>
                <FormControl>
                  <Input placeholder="Optional additional address info" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Only show Date Added to Portal for new houses */}
          {!house && (
            <FormField
              control={form.control}
              name="date_added_to_portal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Added to Portal</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="billing_profile_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Billing Profile Override</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(val === NONE_VALUE ? '' : val)}
                  defaultValue={field.value || NONE_VALUE}
                  disabled={profilesLoading}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Use house type default" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Use house type default</SelectItem>
                    {billingProfiles?.filter(p => p.target_type === 'house' && p.is_active).map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Override the billing profile from the house type for this specific property
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="number_of_plots"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Plots</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  />
                </FormControl>
                <FormDescription>
                  Development Levy is calculated per plot (₦500,000 × plots)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional notes about this house..."
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
            {isLoading ? 'Saving...' : house ? 'Update House' : 'Create House'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
