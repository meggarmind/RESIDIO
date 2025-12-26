'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/lib/auth/auth-provider';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
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
import type { SecurityContactWithDetails, SecurityContactStatus } from '@/types/database';

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Contacts</h1>
          <p className="text-muted-foreground">Manage access for your visitors</p>
        </div>
        <Button size="sm" onClick={() => setIsAddSheetOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Shield className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeContacts.length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{contacts.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts List */}
      <div className="space-y-3">
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
          contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={() => setSelectedContact(contact)}
            />
          ))
        )}
      </div>

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
  );
}

// Contact Card Component
function ContactCard({
  contact,
  onClick,
}: {
  contact: SecurityContactWithDetails;
  onClick: () => void;
}) {
  const config = statusConfig[contact.status];
  const StatusIcon = config.icon;

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors active:scale-[0.99]"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-medium text-primary">
                {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>

            {/* Info */}
            <div className="min-w-0">
              <p className="font-medium truncate">{contact.full_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{contact.category?.name || 'Contact'}</span>
                {contact.relationship && (
                  <>
                    <span className="text-muted-foreground/30">•</span>
                    <span>{contact.relationship}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status & Arrow */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={cn('text-[10px]', config.color)}>
              {config.label}
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Add Contact Sheet
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
      });
      toast.success('Contact added successfully');
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add contact');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle>Add Security Contact</SheetTitle>
          <SheetDescription>
            Add a new person to your security contact list
          </SheetDescription>
        </SheetHeader>

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

            <SheetFooter className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Contact
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

// Contact Detail Sheet
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {contact.full_name}
          </SheetTitle>
          <SheetDescription>
            {contact.category?.name || 'Security Contact'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto pb-8">
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
      </SheetContent>
    </Sheet>
  );
}

// Edit Contact Sheet
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="text-left pb-4">
          <SheetTitle>Edit Contact</SheetTitle>
          <SheetDescription>
            Update contact information
          </SheetDescription>
        </SheetHeader>

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

            <SheetFooter className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
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
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>

      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
