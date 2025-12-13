'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Building,
  FileText,
  Users,
  MoreVertical,
  Edit,
  Trash,
  Key,
  Ban,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import {
  useSecurityContact,
  useCurrentUserSecurityPermissions,
  useUpdateSecurityContactStatus,
  useDeleteSecurityContact,
  useGenerateAccessCode,
  useRevokeAccessCode,
} from '@/hooks/use-security';
import {
  SecurityContactStatusBadge,
  CategoryBadge,
  ValidityBadge,
  AccessCodeTypeBadge,
} from '@/components/security/security-badges';
import { AccessCodeDisplay } from '@/components/security/access-code-display';
import { SecurityContactForm } from '@/components/security/security-contact-form';
import { toast } from 'sonner';
import type { AccessCode } from '@/types/database';

export default function SecurityContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<'active' | 'suspended'>('active');

  const { data: contact, isLoading, error, refetch } = useSecurityContact(id);
  const { data: permissionsData } = useCurrentUserSecurityPermissions();

  const updateStatusMutation = useUpdateSecurityContactStatus();
  const deleteMutation = useDeleteSecurityContact();
  const generateCodeMutation = useGenerateAccessCode();
  const revokeCodeMutation = useRevokeAccessCode();

  const canUpdate = permissionsData?.permissions?.update_contacts || false;
  const canSuspendRevoke = permissionsData?.permissions?.suspend_revoke_contacts || false;
  const canGenerateCodes = permissionsData?.permissions?.generate_codes || false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost">
          <Link href="/security/contacts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Contacts
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Contact Not Found
            </CardTitle>
            <CardDescription>
              The security contact you're looking for doesn't exist or you don't have permission to view it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const activeCode = contact.access_codes?.find(
    (code: AccessCode) => code.is_active && new Date(code.valid_until || '') > new Date()
  );

  const handleStatusChange = async () => {
    try {
      await updateStatusMutation.mutateAsync({
        id: contact.id,
        status: newStatus,
      });
      toast.success(`Contact ${newStatus === 'suspended' ? 'suspended' : 'reactivated'} successfully`);
      setShowStatusDialog(false);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(contact.id);
      toast.success('Contact revoked successfully');
      router.push('/security/contacts');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete contact');
    }
  };

  const handleGenerateCode = async (codeType: 'permanent' | 'one_time') => {
    try {
      await generateCodeMutation.mutateAsync({
        contact_id: contact.id,
        code_type: codeType,
      });
      toast.success(`${codeType === 'permanent' ? 'Permanent' : 'One-time'} code generated successfully`);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate code');
    }
  };

  const handleRevokeCode = async (codeId: string) => {
    try {
      await revokeCodeMutation.mutateAsync({ code_id: codeId });
      toast.success('Code revoked successfully');
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke code');
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setIsEditing(false)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Contact
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Security Contact
            </CardTitle>
            <CardDescription>
              Update the contact information for {contact.full_name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecurityContactForm
              contact={contact}
              onSuccess={() => {
                setIsEditing(false);
                refetch();
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button asChild variant="ghost">
        <Link href="/security/contacts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Contacts
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <User className="h-8 w-8" />
            {contact.full_name}
          </h1>
          <div className="flex items-center gap-2">
            <SecurityContactStatusBadge status={contact.status} />
            {contact.category && <CategoryBadge name={contact.category.name} />}
          </div>
        </div>

        {(canUpdate || canSuspendRevoke) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreVertical className="h-4 w-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Contact
                </DropdownMenuItem>
              )}
              {canSuspendRevoke && contact.status === 'active' && (
                <DropdownMenuItem
                  onClick={() => {
                    setNewStatus('suspended');
                    setShowStatusDialog(true);
                  }}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Suspend Contact
                </DropdownMenuItem>
              )}
              {canSuspendRevoke && contact.status === 'suspended' && (
                <DropdownMenuItem
                  onClick={() => {
                    setNewStatus('active');
                    setShowStatusDialog(true);
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Reactivate Contact
                </DropdownMenuItem>
              )}
              {canSuspendRevoke && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash className="h-4 w-4 mr-2" />
                    Revoke Contact
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Primary Phone</p>
                  <p className="text-sm text-muted-foreground">{contact.phone_primary}</p>
                </div>
              </div>

              {contact.phone_secondary && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Secondary Phone</p>
                    <p className="text-sm text-muted-foreground">{contact.phone_secondary}</p>
                  </div>
                </div>
              )}

              {contact.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Address</p>
                    <p className="text-sm text-muted-foreground">{contact.address}</p>
                  </div>
                </div>
              )}

              {contact.employer && (
                <div className="flex items-start gap-3">
                  <Building className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Employer</p>
                    <p className="text-sm text-muted-foreground">{contact.employer}</p>
                  </div>
                </div>
              )}

              {contact.relationship && (
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Relationship</p>
                    <p className="text-sm text-muted-foreground">{contact.relationship}</p>
                  </div>
                </div>
              )}

              {contact.id_type && (
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">ID Document</p>
                    <p className="text-sm text-muted-foreground">
                      {contact.id_type.replace('_', ' ').toUpperCase()}
                      {contact.id_number && `: ${contact.id_number}`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {contact.next_of_kin_name && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Next of Kin</p>
                  <p className="text-sm text-muted-foreground">{contact.next_of_kin_name}</p>
                  {contact.next_of_kin_phone && (
                    <p className="text-sm text-muted-foreground">{contact.next_of_kin_phone}</p>
                  )}
                </div>
              </>
            )}

            {contact.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-2">Notes</p>
                  <p className="text-sm text-muted-foreground">{contact.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Associated Resident */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Associated Resident
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.resident ? (
              <div className="space-y-2">
                <p className="font-medium">
                  {contact.resident.first_name} {contact.resident.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Code: {contact.resident.resident_code}
                </p>
                {contact.resident.phone_primary && (
                  <p className="text-sm text-muted-foreground">
                    Phone: {contact.resident.phone_primary}
                  </p>
                )}
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href={`/residents/${contact.resident.id}`}>
                    View Resident →
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No resident linked</p>
            )}
          </CardContent>
        </Card>

        {/* Access Codes */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Access Codes
                </CardTitle>
                <CardDescription>
                  Manage access codes for this contact
                </CardDescription>
              </div>
              {canGenerateCodes && contact.status === 'active' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={generateCodeMutation.isPending}>
                      {generateCodeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="mr-2 h-4 w-4" />
                      )}
                      Generate Code
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleGenerateCode('permanent')}>
                      <Clock className="h-4 w-4 mr-2" />
                      Permanent Code
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateCode('one_time')}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      One-Time Code
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {contact.access_codes && contact.access_codes.length > 0 ? (
              <div className="space-y-4">
                {contact.access_codes.map((code: AccessCode) => (
                  <div
                    key={code.id}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      !code.is_active ? 'bg-muted/50 opacity-60' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <AccessCodeDisplay code={code.code} size="lg" />
                        <AccessCodeTypeBadge type={code.code_type} />
                        <ValidityBadge validUntil={code.valid_until} isActive={code.is_active} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Valid from {new Date(code.valid_from).toLocaleDateString()}
                        {code.valid_until && ` to ${new Date(code.valid_until).toLocaleDateString()}`}
                        {code.max_uses && ` • Uses: ${code.current_uses}/${code.max_uses}`}
                      </div>
                    </div>
                    {code.is_active && canGenerateCodes && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeCode(code.id)}
                        disabled={revokeCodeMutation.isPending}
                      >
                        {revokeCodeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Key className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No access codes generated yet</p>
                {canGenerateCodes && contact.status === 'active' && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Click "Generate Code" to create an access code
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newStatus === 'suspended' ? 'Suspend Contact' : 'Reactivate Contact'}
            </DialogTitle>
            <DialogDescription>
              {newStatus === 'suspended'
                ? 'This will suspend the contact and deactivate all their access codes. They will not be able to enter the estate.'
                : 'This will reactivate the contact. You may need to generate new access codes for them.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button
              variant={newStatus === 'suspended' ? 'destructive' : 'default'}
              onClick={handleStatusChange}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {newStatus === 'suspended' ? 'Suspend' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Revoke Contact
            </DialogTitle>
            <DialogDescription>
              This will permanently revoke this security contact. All access codes will be deactivated and the contact will be marked as revoked. This action cannot be undone.
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
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Revoke Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
