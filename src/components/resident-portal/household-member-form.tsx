'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Loader2, UserPlus, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { addHouseholdMember, type HouseholdMemberInput } from '@/actions/residents/add-household-member';

// Form schema
const formSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone_primary: z.string().optional(),
  resident_role: z.enum(['household_member', 'domestic_staff', 'caretaker', 'co_resident', 'contractor']),
  relationship: z.string().optional(),
  send_portal_invite: z.boolean(),
});

type FormValues = z.input<typeof formSchema>;

// Role options with labels
const ROLE_OPTIONS = [
  { value: 'household_member', label: 'Household Member', description: 'Family member or dependent' },
  { value: 'co_resident', label: 'Co-Resident', description: 'Adult living in the unit' },
  { value: 'domestic_staff', label: 'Domestic Staff', description: 'Domestic worker (e.g., driver, cleaner)' },
  { value: 'caretaker', label: 'Caretaker', description: 'Person assigned to maintain the unit' },
  { value: 'contractor', label: 'Contractor', description: 'External service provider' },
] as const;

interface HouseholdMemberFormProps {
  houseId: string;
  houseName?: string;
  onSuccess?: () => void;
  // For controlled mode (external open state)
  // For controlled mode (external open state)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentUserRole?: string;
}

export function HouseholdMemberForm({
  houseId,
  houseName,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  currentUserRole,
}: HouseholdMemberFormProps) {
  // Filter roles based on permissions
  const availableRoles = ROLE_OPTIONS.filter((option) => {
    if (!currentUserRole) return false;

    // Owner-Occupier & Renter can add: Occupant, Family Member, Domestic Staff
    if (['resident_landlord', 'tenant'].includes(currentUserRole)) {
      return ['household_member', 'co_resident', 'domestic_staff'].includes(option.value);
    }

    // Property Owner & Developer can add: Caretaker, Contractor
    if (['non_resident_landlord', 'developer'].includes(currentUserRole)) {
      return ['caretaker', 'contractor'].includes(option.value);
    }

    return false;
  });
  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled or uncontrolled mode
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone_primary: '',
      resident_role: 'household_member',
      relationship: '',
      send_portal_invite: false,
    },
  });

  const watchEmail = form.watch('email');
  const watchSendInvite = form.watch('send_portal_invite');

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const input: HouseholdMemberInput = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email || undefined,
        phone_primary: values.phone_primary || undefined,
        house_id: houseId,
        resident_role: values.resident_role,
        relationship: values.relationship || undefined,
        send_portal_invite: values.send_portal_invite && !!values.email,
      };
      const result = await addHouseholdMember(input);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      const inviteSent = form.getValues('send_portal_invite') && form.getValues('email');
      if (inviteSent) {
        toast.success(`${data?.first_name} added and portal invitation sent`);
      } else {
        toast.success(`${data?.first_name} added to household`);
      }
      form.reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['resident'] });
      queryClient.invalidateQueries({ queryKey: ['householdMembers', houseId] });
      queryClient.invalidateQueries({ queryKey: ['houseResidents', houseId] });
      queryClient.invalidateQueries({ queryKey: ['houseResidentsBatch'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  const dialogContent = (
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

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email (Optional)</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
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
              {availableRoles.length > 0 ? (
                availableRoles.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({option.description})
                      </span>
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="p-2 text-sm text-muted-foreground text-center">
                  You do not have permission to add members
                </div>
              )}
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

        {/* Portal Invitation Checkbox */}
        <div className="flex items-start space-x-3 pt-2 pb-2 p-3 rounded-lg bg-muted/50">
          <Checkbox
            id="send_portal_invite"
            checked={watchSendInvite}
            onCheckedChange={(checked) => form.setValue('send_portal_invite', !!checked)}
            disabled={!watchEmail}
          />
          <div className="space-y-1">
            <Label
              htmlFor="send_portal_invite"
              className="text-sm font-medium cursor-pointer flex items-center gap-2"
            >
              <Mail className="h-3.5 w-3.5" />
              Send portal invitation
            </Label>
            <p className="text-xs text-muted-foreground">
              {watchEmail
                ? 'An email will be sent with instructions to create their own portal account.'
                : 'Enter an email address to enable portal invitations.'}
            </p>
          </div>
        </div>

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
  );

  // Controlled mode (external trigger)
  if (isControlled) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {dialogContent}
      </Dialog>
    );
  }

  // Uncontrolled mode (with trigger button)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
