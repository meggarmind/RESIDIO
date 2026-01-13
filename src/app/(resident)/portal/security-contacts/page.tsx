'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/lib/auth/auth-provider';
import { useIsDesktop } from '@/hooks/use-media-query';
import { FeatureRestrictionGate } from '@/components/resident-portal/feature-restriction-gate';
import {
  useResidentSecurityContacts,
  useSecurityContactCategories,
  useCreateSecurityContact,
  useUpdateSecurityContact,
  useDeleteSecurityContact,
  useContactAccessCodes,
  useGenerateAccessCode,
} from '@/hooks/use-security';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { AvatarCircle } from '@/components/ui/avatar-circle';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  ResponsiveSheet,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
  ResponsiveSheetDescription,
  ResponsiveSheetBody,
  ResponsiveSheetFooter,
} from '@/components/ui/responsive-sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Shield,
  Plus,
  Phone,
  User,
  Key,
  ChevronRight,
  Trash2,
  Edit2,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { z } from 'zod';
import { useLayoutTheme } from '@/contexts/layout-theme-context';
import type { SecurityContactWithDetails, SecurityContactStatus } from '@/types/database';

// Spring physics for smooth, professional animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants for stats cards
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.1, // 100ms stagger between cards
    },
  }),
};

// Contact card animation variants
const contactCardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.05, // 50ms stagger between contact cards
    },
  }),
};

// Simplified schema for resident portal
const portalContactSchema = z.object({
  category_id: z.string().uuid('Please select a category'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone_primary: z.string().min(10, 'Phone number must be at least 10 digits'),
  relationship: z.string().optional().or(z.literal('')),
});

type PortalContactFormData = z.infer<typeof portalContactSchema>;

// Status configuration
const statusConfig: Record<SecurityContactStatus, { icon: React.ElementType; label: string; color: string }> = {
  active: { icon: CheckCircle2, label: 'Active', color: 'text-emerald-600 bg-emerald-500/10' },
  suspended: { icon: Clock, label: 'Suspended', color: 'text-amber-600 bg-amber-500/10' },
  expired: { icon: Clock, label: 'Expired', color: 'text-muted-foreground bg-muted' },
  revoked: { icon: XCircle, label: 'Revoked', color: 'text-red-600 bg-red-500/10' },
};

/**
 * Resident Portal Security Contacts Page
 *
 * Allows residents to:
 * - View their security contacts
 * - Add new contacts (within limits)
 * - Edit contact details
 * - View access codes
 * - Remove contacts
 */
export default function ResidentSecurityContactsPage() {
  const { residentId } = useAuth();
  const isDesktop = useIsDesktop();
  const { isExpanded } = useLayoutTheme();
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<SecurityContactWithDetails | null>(null);
  const [editingContact, setEditingContact] = useState<SecurityContactWithDetails | null>(null);
  const [deleteContact, setDeleteContact] = useState<SecurityContactWithDetails | null>(null);

  // Fetch data
  const { data: contactsData, isLoading: contactsLoading } = useResidentSecurityContacts(residentId || undefined);
  const { data: categories } = useSecurityContactCategories();

  const contacts = contactsData?.data || [];
  const activeContacts = contacts.filter(c => c.status === 'active');

  if (contactsLoading) {
    return <SecurityContactsSkeleton />;
  }

  return (
    <FeatureRestrictionGate
      featureName="security contacts"
      loadingFallback={<SecurityContactsSkeleton />}
    >
      <div className={cn('space-y-6', isExpanded && 'space-y-8')}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={cn(
              'text-2xl font-bold tracking-tight',
              isExpanded && 'text-3xl xl:text-4xl'
            )}>Security Contacts</h1>
            <p className={cn(
              'text-muted-foreground',
              isExpanded && 'text-base'
            )}>Manage access for your visitors</p>
          </div>
          <Button size="sm" onClick={() => setIsAddSheetOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

      {/* Stats */}
      <div className={cn(
        'grid grid-cols-2 gap-3',
        isExpanded && 'lg:grid-cols-4 gap-4'
      )}>
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Shield className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    <AnimatedCounter value={activeContacts.length} />
                  </p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    <AnimatedCounter value={contacts.length} />
                  </p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Contacts List - Grid on desktop, stack on mobile */}
      {contacts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No security contacts yet</p>
            <Button size="sm" onClick={() => setIsAddSheetOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add First Contact
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={cn(
          'gap-3',
          isDesktop
            ? 'grid grid-cols-2 lg:grid-cols-3'
            : 'space-y-3',
          isExpanded && 'xl:grid-cols-4 gap-4'
        )}>
          {contacts.map((contact, index) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={() => setSelectedContact(contact)}
              isDesktop={isDesktop}
              isExpanded={isExpanded}
              index={index}
              onEdit={() => {
                setEditingContact(contact);
              }}
              onDelete={() => {
                setDeleteContact(contact);
              }}
            />
          ))}
        </div>
      )}

      {/* Add Contact Sheet */}
      <AddContactSheet
        open={isAddSheetOpen}
        onOpenChange={setIsAddSheetOpen}
        residentId={residentId || ''}
        categories={categories || []}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailSheet
        contact={selectedContact}
        open={!!selectedContact}
        onOpenChange={(open) => !open && setSelectedContact(null)}
        onEdit={(contact) => {
          setSelectedContact(null);
          setEditingContact(contact);
        }}
        onDelete={(contact) => {
          setSelectedContact(null);
          setDeleteContact(contact);
        }}
      />

      {/* Edit Contact Sheet */}
      <EditContactSheet
        contact={editingContact}
        open={!!editingContact}
        onOpenChange={(open) => !open && setEditingContact(null)}
        categories={categories || []}
      />

        {/* Delete Confirmation Dialog */}
        <DeleteContactDialog
          contact={deleteContact}
          open={!!deleteContact}
          onOpenChange={(open) => !open && setDeleteContact(null)}
        />
      </div>
    </FeatureRestrictionGate>
  );
}

// Contact Card Component (responsive: compact on mobile, full card with hover actions on desktop)
function ContactCard({
  contact,
  onClick,
  isDesktop,
  isExpanded,
  index,
  onEdit,
  onDelete,
}: {
  contact: SecurityContactWithDetails;
  onClick: () => void;
  isDesktop: boolean;
  isExpanded: boolean;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const config = statusConfig[contact.status];

  // Map status to StatusBadge variant
  const getStatusVariant = (status: SecurityContactStatus): 'success' | 'error' | 'warning' | 'info' => {
    if (status === 'active') return 'success';
    if (status === 'revoked') return 'error';
    if (status === 'suspended') return 'warning';
    return 'info';
  };

  // Category color mapping for visual distinction
  const categoryColors: Record<string, string> = {
    'Family': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    'Driver': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    'Staff': 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    'Visitor': 'bg-teal-500/10 text-teal-600 border-teal-500/20',
    'Contractor': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  };
  const categoryColor = categoryColors[contact.category?.name || ''] || 'bg-muted text-muted-foreground';

  return (
    <motion.div
      variants={contactCardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <Card
        className={cn(
          'cursor-pointer transition-all active:scale-[0.99]',
          isDesktop
            ? 'hover:shadow-lg hover:border-primary/30 group'
            : 'hover:border-primary/30'
        )}
        onClick={onClick}
      >
        <CardContent className={cn('p-4', isDesktop && 'pb-3')}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar */}
              <AvatarCircle
                name={contact.full_name}
                size="md"
              />

              {/* Info */}
              <div className="min-w-0">
                <p className="font-medium truncate">{contact.full_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {contact.phone_primary && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {contact.phone_primary}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Badge */}
            <StatusBadge variant={getStatusVariant(contact.status)} className="shrink-0">
              {config.label}
            </StatusBadge>
          </div>

          {/* Category Badge & Desktop Actions */}
          <div className={cn(
            'flex items-center justify-between mt-3',
            isDesktop ? 'pt-3 border-t' : ''
          )}>
            <Badge variant="outline" className={cn('text-[10px]', categoryColor)}>
              {contact.category?.name || 'Contact'}
            </Badge>

            {isDesktop ? (
              /* Desktop: Hover actions (always visible when expanded) */
              <div className={cn(
                'flex items-center gap-1 transition-opacity',
                isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              /* Mobile: Arrow indicator */
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Add Contact Sheet (Responsive: bottom sheet on mobile, centered modal on desktop)
function AddContactSheet({
  open,
  onOpenChange,
  residentId,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentId: string;
  categories: Array<{ id: string; name: string }>;
}) {
  const createMutation = useCreateSecurityContact();

  const form = useForm<PortalContactFormData>({
    resolver: zodResolver(portalContactSchema),
    defaultValues: {
      category_id: '',
      full_name: '',
      phone_primary: '',
      relationship: '',
    },
  });

  async function onSubmit(data: PortalContactFormData) {
    try {
      await createMutation.mutateAsync({
        ...data,
        resident_id: residentId,
        is_recurring: false,
      });
      toast.success('Contact added successfully');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add contact');
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="modal"
      modalSize="md"
    >
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle>Add Security Contact</ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          Add a new person to your security contact list
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
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
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
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
                    <Input placeholder="08012345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="relationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Driver, Nanny, Friend" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ResponsiveSheetFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Contact
              </Button>
            </ResponsiveSheetFooter>
          </form>
        </Form>
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}

// Contact Detail Sheet (Responsive: bottom sheet on mobile, right drawer on desktop)
function ContactDetailSheet({
  contact,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  contact: SecurityContactWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (contact: SecurityContactWithDetails) => void;
  onDelete: (contact: SecurityContactWithDetails) => void;
}) {
  const { data: accessCodes } = useContactAccessCodes(contact?.id);

  if (!contact) return null;

  const config = statusConfig[contact.status];
  const StatusIcon = config.icon;

  // Get the active access code
  const activeCode = accessCodes?.find(code => code.is_active);

  const copyCode = () => {
    if (activeCode?.code) {
      navigator.clipboard.writeText(activeCode.code);
      toast.success('Code copied to clipboard');
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="drawer"
      drawerWidth="md"
    >
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          {contact.full_name}
        </ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          {contact.category?.name || 'Security Contact'}
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody>
        <div className="space-y-6 pb-8">
          {/* Status Badge */}
          <div className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            config.color
          )}>
            <StatusIcon className="h-4 w-4" />
            {config.label}
          </div>

          {/* Access Code */}
          {activeCode && (
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Access Code</p>
                    <p className="text-2xl font-mono font-bold tracking-wider">
                      {activeCode.code}
                    </p>
                    {activeCode.valid_until && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Valid until {format(new Date(activeCode.valid_until), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={copyCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-xs text-muted-foreground">{contact.phone_primary}</p>
              </div>
            </div>

            {contact.relationship && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Relationship</p>
                  <p className="text-xs text-muted-foreground">{contact.relationship}</p>
                </div>
              </div>
            )}

            {contact.created_at && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Added</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(contact.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onEdit(contact)}
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => onDelete(contact)}
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}

// Edit Contact Sheet (Responsive: bottom sheet on mobile, centered modal on desktop)
function EditContactSheet({
  contact,
  open,
  onOpenChange,
  categories,
}: {
  contact: SecurityContactWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Array<{ id: string; name: string }>;
}) {
  const updateMutation = useUpdateSecurityContact();

  const form = useForm<PortalContactFormData>({
    resolver: zodResolver(portalContactSchema),
    values: contact ? {
      category_id: contact.category_id,
      full_name: contact.full_name,
      phone_primary: contact.phone_primary,
      relationship: contact.relationship || '',
    } : undefined,
  });

  async function onSubmit(data: PortalContactFormData) {
    if (!contact) return;
    try {
      await updateMutation.mutateAsync({
        id: contact.id,
        ...data,
      });
      toast.success('Contact updated successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update contact');
    }
  }

  if (!contact) return null;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      variant="modal"
      modalSize="md"
    >
      <ResponsiveSheetHeader>
        <ResponsiveSheetTitle>Edit Contact</ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          Update contact information
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>

      <ResponsiveSheetBody>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
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
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="relationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ResponsiveSheetFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </ResponsiveSheetFooter>
          </form>
        </Form>
      </ResponsiveSheetBody>
    </ResponsiveSheet>
  );
}

// Delete Contact Dialog
function DeleteContactDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: SecurityContactWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteMutation = useDeleteSecurityContact();

  async function handleDelete() {
    if (!contact) return;
    try {
      await deleteMutation.mutateAsync(contact.id);
      toast.success('Contact removed');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove contact');
    }
  }

  if (!contact) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Contact?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove {contact.full_name} from your security contacts?
            This will revoke their access to the estate.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Removing...' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Skeleton
function SecurityContactsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <ShimmerSkeleton className="h-8 w-48" />
          <ShimmerSkeleton className="h-4 w-32" />
        </div>
        <ShimmerSkeleton className="h-9 w-20" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ShimmerSkeleton className="h-20 w-full rounded-xl" />
        <ShimmerSkeleton className="h-20 w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <ShimmerSkeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
