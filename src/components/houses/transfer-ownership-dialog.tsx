'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useResidents, useTransferOwnership } from '@/hooks/use-residents';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type NewOwnerRole = 'non_resident_landlord' | 'developer';

interface TransferOwnershipDialogProps {
  houseId: string;
  /** The current owner; the dialog is open while this is set. Remount (key) per owner to reset the form. */
  owner: { id: string; name: string } | null;
  onClose: () => void;
}

export function TransferOwnershipDialog({ houseId, owner, onClose }: TransferOwnershipDialogProps) {
  const [newOwnerId, setNewOwnerId] = useState('');
  const [newOwnerRole, setNewOwnerRole] = useState<NewOwnerRole>('non_resident_landlord');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Same 500-row list as the Link dialog (shared cache key), fetched only while this dialog is open.
  const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 500 }, { enabled: !!owner });
  const transferMutation = useTransferOwnership();

  const availableNewOwners = (residentsData?.data ?? []).filter((r) => r.id !== owner?.id);

  const handleTransfer = async () => {
    if (!owner || !newOwnerId) {
      toast.error('Please select a new owner');
      return;
    }

    try {
      await transferMutation.mutateAsync({
        houseId,
        currentOwnerId: owner.id,
        newOwnerId,
        newOwnerRole,
        transferDate,
        transferNotes: notes || undefined,
      });
      toast.success('Ownership transferred successfully');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to transfer ownership');
    }
  };

  return (
    <Dialog open={!!owner} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Ownership</DialogTitle>
          <DialogDescription>Transfer ownership from {owner?.name} to a new owner.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>New Owner Type</Label>
            <Select value={newOwnerRole} onValueChange={(v) => setNewOwnerRole(v as NewOwnerRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select new owner type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="non_resident_landlord">Property Owner</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>New Owner</Label>
            <SearchableSelect
              options={availableNewOwners.map((r) => ({
                value: r.id,
                label: `${r.first_name} ${r.last_name} (${r.resident_code})`,
              }))}
              value={newOwnerId}
              onValueChange={setNewOwnerId}
              placeholder={residentsLoading ? 'Loading...' : 'Search a new owner...'}
              searchPlaceholder="Search by name or code..."
            />
          </div>
          <div className="grid gap-2">
            <Label>Transfer Date</Label>
            <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="e.g., Sale reference, deed number"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={!newOwnerId || transferMutation.isPending}>
            {transferMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Transfer Ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
