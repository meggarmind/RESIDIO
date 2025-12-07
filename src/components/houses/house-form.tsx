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
import { houseFormSchema, type HouseFormData } from '@/lib/validators/house';
import { toast } from 'sonner';
import type { House } from '@/types/database';

interface HouseFormProps {
  house?: House;
  onSuccess?: () => void;
}

export function HouseForm({ house, onSuccess }: HouseFormProps) {
  const router = useRouter();
  const { data: streets, isLoading: streetsLoading } = useStreets();
  const { data: houseTypes, isLoading: typesLoading } = useHouseTypes();
  const createMutation = useCreateHouse();
  const updateMutation = useUpdateHouse();

  const form = useForm<HouseFormData>({
    resolver: zodResolver(houseFormSchema),
    defaultValues: {
      house_number: house?.house_number ?? '',
      street_id: house?.street_id ?? '',
      house_type_id: house?.house_type_id ?? '',
      address_line_2: house?.address_line_2 ?? '',
      notes: house?.notes ?? '',
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  async function onSubmit(data: HouseFormData) {
    try {
      if (house) {
        await updateMutation.mutateAsync({ id: house.id, data });
        toast.success('House updated successfully');
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
