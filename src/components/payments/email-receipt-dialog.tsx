'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { usePaymentRecipients, useSendPaymentReceiptEmail } from '@/hooks/use-email';
import { Mail, Loader2, User, Users, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailReceiptDialogProps {
  paymentId: string;
  trigger?: React.ReactNode;
}

export function EmailReceiptDialog({ paymentId, trigger }: EmailReceiptDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  const { data: recipients, isLoading, error } = usePaymentRecipients(open ? paymentId : undefined);
  const sendEmailMutation = useSendPaymentReceiptEmail();

  // Auto-select main resident when data loads
  useEffect(() => {
    if (recipients?.mainResident?.email) {
      setSelectedEmails(new Set([recipients.mainResident.email]));
    }
  }, [recipients]);

  const handleToggleEmail = (email: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedEmails(newSelected);
  };

  const handleSelectAll = () => {
    const allEmails = new Set<string>();
    if (recipients?.mainResident?.email) {
      allEmails.add(recipients.mainResident.email);
    }
    recipients?.coResidents.forEach((r) => {
      allEmails.add(r.email);
    });
    setSelectedEmails(allEmails);
  };

  const handleDeselectAll = () => {
    setSelectedEmails(new Set());
  };

  const handleSend = async () => {
    if (selectedEmails.size === 0) return;

    await sendEmailMutation.mutateAsync({
      paymentId,
      recipientEmails: Array.from(selectedEmails),
    });

    if (sendEmailMutation.isSuccess) {
      setOpen(false);
    }
  };

  const totalRecipients = (recipients?.mainResident ? 1 : 0) + (recipients?.coResidents.length || 0);
  const allSelected = selectedEmails.size === totalRecipients && totalRecipients > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Mail className="h-4 w-4 mr-2" />
            Email Receipt
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Email Payment Receipt</DialogTitle>
          <DialogDescription>
            Select recipients to send the payment receipt via email.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : error || recipients?.error ? (
            <div className="flex items-center gap-2 text-destructive py-4">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{recipients?.error || 'Failed to load recipients'}</span>
            </div>
          ) : !recipients?.mainResident && recipients?.coResidents.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No recipients with email addresses found</p>
              <p className="text-xs mt-1">The resident may not have an email on file</p>
            </div>
          ) : (
            <>
              {/* Quick actions */}
              {totalRecipients > 1 && (
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">
                    {selectedEmails.size} of {totalRecipients} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={allSelected ? handleDeselectAll : handleSelectAll}
                  >
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                {/* Main Resident */}
                {recipients?.mainResident && (
                  <div
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                      selectedEmails.has(recipients.mainResident.email)
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                    onClick={() => handleToggleEmail(recipients.mainResident!.email)}
                  >
                    <Checkbox
                      id="main-resident"
                      checked={selectedEmails.has(recipients.mainResident.email)}
                      onCheckedChange={() => handleToggleEmail(recipients.mainResident!.email)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <Label
                          htmlFor="main-resident"
                          className="font-medium cursor-pointer"
                        >
                          {recipients.mainResident.name}
                        </Label>
                        <Badge variant="default" className="text-xs">Primary</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {recipients.mainResident.email}
                      </p>
                    </div>
                    {selectedEmails.has(recipients.mainResident.email) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                )}

                {/* Co-Residents */}
                {recipients?.coResidents && recipients.coResidents.length > 0 && (
                  <>
                    {recipients.mainResident && (
                      <div className="flex items-center gap-2 mt-4 mb-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Co-Residents ({recipients.coResidents.length})
                        </span>
                      </div>
                    )}
                    {recipients.coResidents.map((resident) => (
                      <div
                        key={resident.residentId}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                          selectedEmails.has(resident.email)
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        )}
                        onClick={() => handleToggleEmail(resident.email)}
                      >
                        <Checkbox
                          id={resident.residentId}
                          checked={selectedEmails.has(resident.email)}
                          onCheckedChange={() => handleToggleEmail(resident.email)}
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={resident.residentId}
                            className="font-medium cursor-pointer block"
                          >
                            {resident.name}
                          </Label>
                          <p className="text-sm text-muted-foreground truncate">
                            {resident.email}
                          </p>
                        </div>
                        {selectedEmails.has(resident.email) && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={selectedEmails.size === 0 || sendEmailMutation.isPending}
          >
            {sendEmailMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            <Mail className="h-4 w-4 mr-2" />
            Send to {selectedEmails.size} Recipient{selectedEmails.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
