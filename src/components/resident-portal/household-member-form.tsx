'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { addHouseholdMember, type HouseholdMemberInput } from '@/actions/residents/add-household-member';

// Form schema
const formSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone_primary: z.string().optional(),
  resident_role: z.enum(['household_member', 'domestic_staff', 'caretaker']),
  relationship: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// Role options with labels
const ROLE_OPTIONS = [
  { value: 'household_member', label: 'Household Member', description: 'Family member or dependent' },
  { value: 'domestic_staff', label: 'Domestic Staff', description: 'Domestic worker (e.g., driver, cleaner)' },
  { value: 'caretaker', label: 'Caretaker', description: 'Person assigned to maintain the unit' },
] as const;

interface HouseholdMemberFormProps {
  houseId: string;
  houseName?: string;
  onSuccess?: () => void;
}

export function HouseholdMemberForm({ houseId, houseName, onSuccess }: HouseholdMemberFormProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone_primary: '',
      resident_role: 'household_member',
      relationship: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const input: HouseholdMemberInput = {
        ...values,
        house_id: houseId,
      };
      const result = await addHouseholdMember(input);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(`${data?.first_name} added to household`);
      form.reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['resident'] });
      queryClient.invalidateQueries({ queryKey: ['householdMembers', houseId] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Household Member</DialogTitle>
          <DialogDescription>
            {houseName ? `Add a new member to ${houseName}` : 'Add a new member to your household'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name *</Label>
            <Input
              id="first_name"
              placeholder="John"
              {...form.register('first_name')}
            />
            {form.formState.errors.first_name && (
              <p className="text-xs text-destructive">{form.formState.errors.first_name.message}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name *</Label>
            <Input
              id="last_name"
              placeholder="Doe"
              {...form.register('last_name')}
            />
            {form.formState.errors.last_name && (
              <p className="text-xs text-destructive">{form.formState.errors.last_name.message}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone_primary">Phone (Optional)</Label>
            <Input
              id="phone_primary"
              type="tel"
              placeholder="+234 800 000 0000"
              {...form.register('phone_primary')}
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="resident_role">Role *</Label>
            <Select
              value={form.watch('resident_role')}
              onValueChange={(value) => form.setValue('resident_role', value as FormValues['resident_role'])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({option.description})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Relationship (for household members) */}
          {form.watch('resident_role') === 'household_member' && (
            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Input
                id="relationship"
                placeholder="e.g., Spouse, Child, Parent"
                {...form.register('relationship')}
              />
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Member
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
