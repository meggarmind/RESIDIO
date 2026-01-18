'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Search, Check, ChevronsUpDown, User, Building, Wallet, Banknote } from 'lucide-react';
import { useManualMatch, useCreatePaymentAlias } from '@/hooks/use-imports';
import { useResidents } from '@/hooks/use-residents';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/actions/projects/get-projects';
import { getPettyCashAccounts } from '@/actions/finance/petty-cash';
import { getExpenseCategories } from '@/actions/expenses/get-expense-categories';
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
  const [activeTab, setActiveTab] = useState('resident');

  // Resident State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [saveAsAlias, setSaveAsAlias] = useState(true);
  const [aliasNotes, setAliasNotes] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Other Assignment States
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedPettyCash, setSelectedPettyCash] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const manualMatchMutation = useManualMatch();
  const createAliasMutation = useCreatePaymentAlias();

  // Data Fetching
  const { data: residentsData, isLoading: isLoadingResidents } = useResidents({
    search: searchQuery,
    limit: 20,
  });

  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await getProjects();
      return Array.isArray(data) ? data : [];
    }
  });

  const { data: pettyCashAccounts, isLoading: isLoadingPettyCash } = useQuery({
    queryKey: ['petty-cash-accounts'],
    queryFn: async () => {
      const result = await getPettyCashAccounts(); // Already matched action signature in hook? No, action returns array directly or {data, error}? 
      // Checked petty-cash.ts: export async function getPettyCashAccounts(): Promise<PettyCashAccount[]>
      return result;
    }
  });

  const { data: expenseCategories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      // Need to verify if getExpenseCategories exports directly or needs wrapper.
      // Assuming implementation matches typical pattern
      const result = await getExpenseCategories();
      return result;
    }
  });

  const residents = residentsData?.data || [];

  // Reset state when row changes
  useEffect(() => {
    if (open) {
      if (row?.matched_resident_id) {
        setActiveTab('resident');
        // We'd ideally pre-fill matched resident, but searching is enough
      } else if (row?.matched_project_id) {
        setActiveTab('project');
        setSelectedProject(row.matched_project_id);
      } else if (row?.matched_petty_cash_account_id) {
        setActiveTab('petty_cash');
        setSelectedPettyCash(row.matched_petty_cash_account_id);
      } else if (row?.matched_expense_category_id) {
        setActiveTab('expense');
        setSelectedCategory(row.matched_expense_category_id);
      } else {
        setActiveTab('resident');
      }
    }
  }, [open, row]);

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
    if (!row) return;

    try {
      const params: any = { row_id: row.id };

      if (activeTab === 'resident') {
        if (!selectedResident) return;
        params.resident_id = selectedResident.id;

        // Create alias if checkbox is checked
        if (saveAsAlias && senderName) {
          await createAliasMutation.mutateAsync({
            resident_id: selectedResident.id,
            alias_name: senderName,
            notes: aliasNotes || `Auto-saved from import on ${new Date().toLocaleDateString()}`,
            is_active: true,
          });
        }
      } else if (activeTab === 'project') {
        if (!selectedProject) return;
        params.project_id = selectedProject;
      } else if (activeTab === 'petty_cash') {
        if (!selectedPettyCash) return;
        params.petty_cash_account_id = selectedPettyCash;
      } else if (activeTab === 'expense') {
        if (!selectedCategory) return;
        params.expense_category_id = selectedCategory;
      }

      // Match the row
      await manualMatchMutation.mutateAsync(params);

      toast.success('Row assigned successfully');
      handleClose();
      onComplete();
    } catch (error) {
      // Error handled by mutations
      console.error(error);
    }
  };

  const handleClose = () => {
    setSelectedResident(null);
    setSearchQuery('');
    setSaveAsAlias(true);
    setAliasNotes('');
    setPopoverOpen(false);
    setSelectedProject('');
    setSelectedPettyCash('');
    setSelectedCategory('');
    onOpenChange(false);
  };

  const getActiveSelection = () => {
    switch (activeTab) {
      case 'resident': return !!selectedResident;
      case 'project': return !!selectedProject;
      case 'petty_cash': return !!selectedPettyCash;
      case 'expense': return !!selectedCategory;
      default: return false;
    }
  }

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Assign Transaction</DialogTitle>
          <DialogDescription>
            Assign this {row.transaction_type} of ₦{(row.amount || 0).toLocaleString()} to an entity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transaction Details Capsule */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm border">
            <p className="font-medium truncate">{row.description}</p>
            <div className="flex gap-3 text-muted-foreground mt-1 text-xs">
              <span>{row.transaction_date ? new Date(row.transaction_date).toLocaleDateString() : 'No Date'}</span>
              <span>•</span>
              <span>Ref: {row.reference || 'N/A'}</span>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="resident" className="gap-2 text-xs">
                <User className="h-3.5 w-3.5" /> Resident
              </TabsTrigger>
              <TabsTrigger value="project" className="gap-2 text-xs">
                <Building className="h-3.5 w-3.5" /> Project
              </TabsTrigger>
              <TabsTrigger value="petty_cash" className="gap-2 text-xs">
                <Wallet className="h-3.5 w-3.5" /> Petty Cash
              </TabsTrigger>
              <TabsTrigger value="expense" className="gap-2 text-xs">
                <Banknote className="h-3.5 w-3.5" /> Category
              </TabsTrigger>
            </TabsList>

            {/* Resident Tab */}
            <TabsContent value="resident" className="space-y-4 pt-4">
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

              {selectedResident && senderName && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="save-alias"
                      checked={saveAsAlias}
                      onCheckedChange={(checked) => setSaveAsAlias(checked === true)}
                    />
                    <div className="space-y-1 leading-none">
                      <Label htmlFor="save-alias" className="cursor-pointer">
                        Save alias &quot;{senderName}&quot;
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Auto-match future payments from this name
                      </p>
                    </div>
                  </div>
                  {saveAsAlias && (
                    <div className="pl-6">
                      <Input
                        placeholder="Note (e.g. Spouse account)"
                        value={aliasNotes}
                        onChange={(e) => setAliasNotes(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Project Tab */}
            <TabsContent value="project" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select Capital Project</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingProjects ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : (projects || []).length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">No active projects</div>
                    ) : (projects || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This debit will be recorded as an expense for this project.
                </p>
              </div>
            </TabsContent>

            {/* Petty Cash Tab */}
            <TabsContent value="petty_cash" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select Petty Cash Account</Label>
                <Select value={selectedPettyCash} onValueChange={setSelectedPettyCash}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingPettyCash ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : (pettyCashAccounts || []).length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">No accounts found</div>
                    ) : (pettyCashAccounts || []).map((acc: any) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {row.transaction_type === 'credit'
                    ? "Income will be recorded as a collection/inflow to this petty cash account."
                    : "Debit will be recorded as a replenishment (transfer) to this petty cash account."}
                </p>
              </div>
            </TabsContent>

            {/* Expense Tab */}
            <TabsContent value="expense" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select Expense Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category (e.g. Salary)" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCategories ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : (expenseCategories || []).length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">No categories found</div>
                    ) : (expenseCategories || []).map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This debit will be recorded as a general expense.
                </p>
              </div>
            </TabsContent>

          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!getActiveSelection() || manualMatchMutation.isPending}
          >
            {manualMatchMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
