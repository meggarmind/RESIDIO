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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useCreateSecurityContact, useSecurityContactCategories, useResidentSecurityContacts } from '@/hooks/use-security';
import { toast } from 'sonner';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  const { data: contactsData } = useResidentSecurityContacts(residentId || undefined);
  const createMutation = useCreateSecurityContact();
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success'>('idle');

  // Get recent visitors
  const recentVisitors = contactsData?.data
    ?.filter((c) => c.category?.name?.toLowerCase() === 'visitor')
    .sort((a, b) => {
      // Sort by last visit (if available) or creation date
      const dateA = new Date(a.last_visit_at || a.created_at).getTime();
      const dateB = new Date(b.last_visit_at || b.created_at).getTime();
      return dateB - dateA;
    })
    .slice(0, 5) || [];

  // Helper to auto-fill form
  const prefillVisitor = (visitor: any) => {
    form.setValue('full_name', visitor.full_name);
    form.setValue('phone_primary', visitor.phone_primary);
    // In MVP, we map vehicle reg to phone_secondary
    if (visitor.phone_secondary) {
      form.setValue('vehicle_registration', visitor.phone_secondary);
    }
    form.setFocus('validity_hours');
  };

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

    setSubmitState('loading');
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

      setSubmitState('success');
      toast.success('Visitor access created successfully');

      // Hold for 800ms to show success, then close
      setTimeout(() => {
        form.reset();
        setSubmitState('idle');
        onOpenChange(false);
      }, 800);
    } catch (error) {
      setSubmitState('idle');
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

            {/* Recent Visitors Carousel */}
            {recentVisitors.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Visitors</label>
                <ScrollArea className="w-full whitespace-nowrap pb-2">
                  <div className="flex w-max space-x-4 p-1">
                    {recentVisitors.map((visitor) => (
                      <button
                        key={visitor.id}
                        type="button"
                        onClick={() => prefillVisitor(visitor)}
                        className="flex flex-col items-center gap-2 group transition-all active:scale-95"
                      >
                        <div className="p-0.5 rounded-full border-2 border-transparent group-hover:border-primary/50 transition-colors">
                          <Avatar className="h-12 w-12 border border-border shadow-sm">
                            <AvatarImage src={visitor.photo_url || ''} />
                            <AvatarFallback className="text-xs bg-muted/50">
                              {visitor.full_name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .substring(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <span className="text-[10px] font-medium w-16 truncate text-center text-muted-foreground group-hover:text-foreground transition-colors">
                          {visitor.full_name.split(' ')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" className="h-1.5" />
                </ScrollArea>
              </div>
            )}

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
                disabled={submitState !== 'idle'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitState !== 'idle'}
                className={cn(
                  "min-w-[140px] transition-all duration-300",
                  submitState === 'success' && "btn-success-state success-glow"
                )}
              >
                <AnimatePresence mode="wait">
                  {submitState === 'loading' && (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </motion.span>
                  )}
                  {submitState === 'success' && (
                    <motion.span
                      key="success"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Created!
                    </motion.span>
                  )}
                  {submitState === 'idle' && (
                    <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      Create Access
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
