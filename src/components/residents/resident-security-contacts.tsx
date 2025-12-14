'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Shield,
  Plus,
  Loader2,
  MoreVertical,
  Eye,
  Ban,
  Trash,
  Key,
  CheckCircle,
  Phone,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  useResidentSecurityContacts,
  useCurrentUserSecurityPermissions,
  useUpdateSecurityContactStatus,
  useDeleteSecurityContact,
  useGenerateAccessCode,
} from '@/hooks/use-security';
import {
  SecurityContactStatusBadge,
  CategoryBadge,
  ValidityBadge,
  AccessCodeTypeBadge,
} from '@/components/security/security-badges';
import { AccessCodeDisplay } from '@/components/security/access-code-display';
import { toast } from 'sonner';
import type { SecurityContactWithDetails, AccessCode } from '@/types/database';

interface ResidentSecurityContactsProps {
  residentId: string;
}

export function ResidentSecurityContacts({ residentId }: ResidentSecurityContactsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const { data: contactsData, isLoading, refetch } = useResidentSecurityContacts(residentId);
  const { data: permissionsData } = useCurrentUserSecurityPermissions();

  const updateStatusMutation = useUpdateSecurityContactStatus();
  const deleteMutation = useDeleteSecurityContact();
  const generateCodeMutation = useGenerateAccessCode();

  const canRegisterContacts = permissionsData?.permissions?.register_contacts || false;
  const canUpdateContacts = permissionsData?.permissions?.update_contacts || false;
  const canSuspendRevoke = permissionsData?.permissions?.suspend_revoke_contacts || false;
  const canGenerateCodes = permissionsData?.permissions?.generate_codes || false;

  const contacts = contactsData?.data || [];

  const handleSuspend = async (contactId: string) => {
    try {
      await updateStatusMutation.mutateAsync({
        id: contactId,
        status: 'suspended',
      });
      toast.success('Contact suspended');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to suspend contact');
    }
  };

  const handleReactivate = async (contactId: string) => {
    try {
      await updateStatusMutation.mutateAsync({
        id: contactId,
        status: 'active',
      });
      toast.success('Contact reactivated');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reactivate contact');
    }
  };

  const handleDelete = async () => {
    if (!selectedContactId) return;

    try {
      await deleteMutation.mutateAsync(selectedContactId);
      toast.success('Contact revoked');
      setShowDeleteDialog(false);
      setSelectedContactId(null);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke contact');
    }
  };

  const handleGenerateCode = async (contactId: string, codeType: 'permanent' | 'one_time') => {
    try {
      await generateCodeMutation.mutateAsync({
        contact_id: contactId,
        code_type: codeType,
      });
      toast.success(`${codeType === 'permanent' ? 'Permanent' : 'One-time'} code generated`);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate code');
    }
  };

  const openDeleteDialog = (contactId: string) => {
    setSelectedContactId(contactId);
    setShowDeleteDialog(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Contacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Contacts
            </CardTitle>
            <CardDescription>
              Authorized visitors and staff for this resident
            </CardDescription>
          </div>
          {canRegisterContacts && (
            <Button asChild>
              <Link href={`/security/contacts/new?resident_id=${residentId}`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {contacts.length > 0 ? (
          <div className="space-y-4">
            {contacts.map((contact: SecurityContactWithDetails) => {
              const activeCode = contact.access_codes?.find(
                (code: AccessCode) =>
                  code.is_active && new Date(code.valid_until || '') > new Date()
              );

              return (
                <div
                  key={contact.id}
                  className={`flex items-start justify-between p-4 border rounded-lg ${
                    contact.status !== 'active' ? 'bg-muted/50 opacity-70' : ''
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{contact.full_name}</span>
                      <SecurityContactStatusBadge status={contact.status} />
                      {contact.category && <CategoryBadge name={contact.category.name} />}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {contact.phone_primary}
                    </div>
                    {activeCode && (
                      <div className="flex items-center gap-2 mt-2">
                        <AccessCodeDisplay code={activeCode.code} size="sm" />
                        <AccessCodeTypeBadge type={activeCode.code_type} />
                        <ValidityBadge validUntil={activeCode.valid_until} isActive={activeCode.is_active} />
                      </div>
                    )}
                    {!activeCode && contact.status === 'active' && (
                      <p className="text-xs text-muted-foreground">No active access code</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {canGenerateCodes && contact.status === 'active' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" disabled={generateCodeMutation.isPending}>
                            {generateCodeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Key className="h-4 w-4 mr-1" />
                                Code
                              </>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleGenerateCode(contact.id, 'permanent')}>
                            <Clock className="h-4 w-4 mr-2" />
                            Permanent Code
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGenerateCode(contact.id, 'one_time')}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            One-Time Code
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/security/contacts/${contact.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        {canSuspendRevoke && contact.status === 'active' && (
                          <DropdownMenuItem onClick={() => handleSuspend(contact.id)}>
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend
                          </DropdownMenuItem>
                        )}
                        {canSuspendRevoke && contact.status === 'suspended' && (
                          <DropdownMenuItem onClick={() => handleReactivate(contact.id)}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Reactivate
                          </DropdownMenuItem>
                        )}
                        {canSuspendRevoke && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openDeleteDialog(contact.id)}
                            >
                              <Trash className="h-4 w-4 mr-2" />
                              Revoke
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No security contacts registered</p>
            {canRegisterContacts && (
              <Button asChild variant="outline" className="mt-4">
                <Link href={`/security/contacts/new?resident_id=${residentId}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Register First Contact
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Contact</DialogTitle>
            <DialogDescription>
              This will permanently revoke this security contact. All access codes will be deactivated.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
