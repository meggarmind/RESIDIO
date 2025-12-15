'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Search, Check, ChevronsUpDown, User } from 'lucide-react';
import { useManualMatch, useCreatePaymentAlias } from '@/hooks/use-imports';
import { useResidents } from '@/hooks/use-residents';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { BankStatementRow, Resident } from '@/types/database';

interface ManualMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: BankStatementRow | null;
  onComplete: () => void;
}

export function ManualMatchDialog({
  open,
  onOpenChange,
  row,
  onComplete,
}: ManualMatchDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [saveAsAlias, setSaveAsAlias] = useState(true);
  const [aliasNotes, setAliasNotes] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  const manualMatchMutation = useManualMatch();
  const createAliasMutation = useCreatePaymentAlias();

  const { data: residentsData, isLoading: isLoadingResidents } = useResidents({
    search: searchQuery,
    limit: 20,
  });

  const residents = residentsData?.data || [];

  // Extract sender name from description for alias
  const senderName = useMemo(() => {
    if (!row?.description) return '';
    // Try to extract name from common patterns
    const desc = row.description;
    // Pattern: "TRANSFER FROM Name Here"
    const fromMatch = desc.match(/(?:TRANSFER\s+)?FROM\s+([A-Z\s.]+?)(?:\s+TO|\s+REF|$)/i);
    if (fromMatch) return fromMatch[1].trim();
    // Pattern: "Name Here - description"
    const dashMatch = desc.match(/^([A-Z\s.]+?)\s*-/i);
    if (dashMatch) return dashMatch[1].trim();
    // Return first meaningful words
    return desc.split(/\s+/).slice(0, 3).join(' ');
  }, [row?.description]);

  const handleMatch = async () => {
    if (!row || !selectedResident) return;

    try {
      // Create alias if checkbox is checked
      if (saveAsAlias && senderName) {
        await createAliasMutation.mutateAsync({
          resident_id: selectedResident.id,
          alias_name: senderName,
          notes: aliasNotes || `Auto-saved from import on ${new Date().toLocaleDateString()}`,
          is_active: true,
        });
      }

      // Match the row
      await manualMatchMutation.mutateAsync({
        row_id: row.id,
        resident_id: selectedResident.id,
        save_as_alias: false, // We already created it above
      });

      toast.success('Row matched successfully');
      handleClose();
      onComplete();
    } catch (error) {
      // Error handled by mutations
    }
  };

  const handleClose = () => {
    setSelectedResident(null);
    setSearchQuery('');
    setSaveAsAlias(true);
    setAliasNotes('');
    setPopoverOpen(false);
    onOpenChange(false);
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manually Assign Resident</DialogTitle>
          <DialogDescription>
            Match this transaction to a resident
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transaction Details */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {row.transaction_date
                  ? new Date(row.transaction_date).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium font-mono">
                ₦{(row.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <Separator />
            <div className="text-sm">
              <span className="text-muted-foreground">Description</span>
              <p className="font-medium mt-1 break-words">{row.description}</p>
            </div>
            {row.reference && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reference</span>
                <p className="font-medium font-mono mt-1">{row.reference}</p>
              </div>
            )}
          </div>

          {/* Resident Search */}
          <div className="space-y-2">
            <Label>Select Resident</Label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-between"
                >
                  {selectedResident ? (
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {selectedResident.first_name} {selectedResident.last_name}
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {selectedResident.resident_code}
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search for a resident...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[450px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by name, phone, or code..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    {isLoadingResidents ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : residents.length === 0 ? (
                      <CommandEmpty>No residents found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {residents.map((resident) => (
                          <CommandItem
                            key={resident.id}
                            value={resident.id}
                            onSelect={() => {
                              setSelectedResident(resident);
                              setPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedResident?.id === resident.id
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col">
                              <span>
                                {resident.first_name} {resident.last_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {resident.resident_code} • {resident.phone_primary}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Save as Alias */}
          {selectedResident && senderName && (
            <div className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="save-alias"
                  checked={saveAsAlias}
                  onCheckedChange={(checked) => setSaveAsAlias(checked === true)}
                />
                <div className="space-y-1 leading-none">
                  <Label htmlFor="save-alias" className="cursor-pointer">
                    Save sender name as payment alias
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    This will help automatically match future payments from &quot;{senderName}&quot;
                  </p>
                </div>
              </div>

              {saveAsAlias && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="alias-notes">Alias Notes (optional)</Label>
                  <Textarea
                    id="alias-notes"
                    placeholder="e.g., Spouse's account, Company account"
                    value={aliasNotes}
                    onChange={(e) => setAliasNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedResident || manualMatchMutation.isPending}
          >
            {manualMatchMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Match Resident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
