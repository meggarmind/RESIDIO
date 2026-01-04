'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useCreateSecurityContact, useSecurityContactCategories } from '@/hooks/use-security';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// Simplified visitor form schema
const visitorFormSchema = z.object({
  full_name: z.string().min(2, 'Name is required'),
  phone_primary: z.string().min(10, 'Phone number is required'),
  vehicle_registration: z.string().optional(),
  house_id: z.string().min(1, 'Please select a property'),
  validity_hours: z.string(),
});

type VisitorFormData = z.infer<typeof visitorFormSchema>;

interface VisitorAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VisitorAccessDialog({ open, onOpenChange }: VisitorAccessDialogProps) {
  const { residentId } = useAuth();
  const { data: resident } = useResident(residentId || undefined);
  const { data: categories } = useSecurityContactCategories();
  const createMutation = useCreateSecurityContact();

  // Get visitor category
  const visitorCategory = categories?.find((c) => c.name?.toLowerCase() === 'visitor');

  // Get resident's active houses
  const activeHouses = resident?.resident_houses?.filter((rh) => rh.is_active) || [];

  const form = useForm<VisitorFormData>({
    resolver: zodResolver(visitorFormSchema),
    defaultValues: {
      full_name: '',
      phone_primary: '',
      vehicle_registration: '',
      house_id: activeHouses.length === 1 ? activeHouses[0].house_id : '',
      validity_hours: '24',
    },
  });

  async function onSubmit(data: VisitorFormData) {
    if (!residentId || !visitorCategory) {
      toast.error('Unable to create visitor access');
      return;
    }

    try {
      // Calculate expiry date
      const hours = parseInt(data.validity_hours);
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + hours);

      await createMutation.mutateAsync({
        resident_id: residentId,
        category_id: visitorCategory.id,
        full_name: data.full_name,
        phone_primary: data.phone_primary,
        phone_secondary: data.vehicle_registration || undefined,
        relationship: 'Visitor',
        notes: data.vehicle_registration
          ? `Vehicle: ${data.vehicle_registration}. Valid for ${hours} hours.`
          : `Valid for ${hours} hours.`,
      });

      toast.success('Visitor access created successfully');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create visitor access');
      console.error(error);
    }
  }

  // Show message if no visitor category
  if (categories && !visitorCategory) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Visitor Access</DialogTitle>
            <DialogDescription>
              Visitor category is not configured. Please contact your estate administrator.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Show message if no active houses
  if (activeHouses.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Visitor Access</DialogTitle>
            <DialogDescription>
              You don't have any active properties assigned. Please contact your estate
              administrator.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Visitor Access</DialogTitle>
          <DialogDescription>
            Generate an access code for your visitor. They will be able to access the estate
            for the specified duration.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visitor Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
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
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="+234 800 000 0000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vehicle_registration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Registration (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="ABC-123-XY" {...field} />
                  </FormControl>
                  <FormDescription>
                    Enter the visitor's vehicle registration if they'll be driving
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {activeHouses.length > 1 && (
              <FormField
                control={form.control}
                name="house_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeHouses.map((rh) => (
                          <SelectItem key={rh.house_id} value={rh.house_id}>
                            {rh.house?.short_name || rh.house?.house_number || 'Property'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="validity_hours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Duration</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="24">24 Hours</SelectItem>
                      <SelectItem value="48">48 Hours</SelectItem>
                      <SelectItem value="72">3 Days</SelectItem>
                      <SelectItem value="168">1 Week</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Access will expire after the selected duration
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Access
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
