'use client';

import { useState } from 'react';
import { Search, Eye, User, Home, Phone, Mail, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useImpersonation } from '@/hooks/use-impersonation';
import type { ResidentForImpersonation } from '@/types/database';

interface ResidentImpersonationSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Resident Impersonation Selector
 *
 * A dialog that allows admins to search for and select a resident
 * to impersonate. Shows resident details including name, contact info,
 * and house address.
 */
export function ResidentImpersonationSelector({
  open,
  onOpenChange,
  onSuccess,
}: ResidentImpersonationSelectorProps) {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    startImpersonation,
    isStarting,
    requiresApproval,
  } = useImpersonation();

  const [selectedResident, setSelectedResident] = useState<ResidentForImpersonation | null>(null);

  const handleSelectResident = (resident: ResidentForImpersonation) => {
    setSelectedResident(resident);
  };

  const handleStartImpersonation = async () => {
    if (!selectedResident) return;

    try {
      await startImpersonation(selectedResident.id);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedResident(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-amber-500" />
            View Portal as Resident
          </DialogTitle>
          <DialogDescription>
            Search for a resident to view their portal experience.
            {requiresApproval && (
              <span className="text-amber-600 dark:text-amber-400 block mt-1">
                Note: Your impersonation request will require approval.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone, or resident code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {/* Search results */}
          <ScrollArea className="h-[400px] rounded-md border">
            {isSearching ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchQuery.length < 2 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <Search className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Type at least 2 characters to search</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">No residents found</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {searchResults.map((resident) => (
                  <ResidentCard
                    key={resident.id}
                    resident={resident}
                    isSelected={selectedResident?.id === resident.id}
                    onClick={() => handleSelectResident(resident)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Selected resident confirmation */}
          {selectedResident && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedResident.avatar_url || undefined} />
                  <AvatarFallback>
                    {selectedResident.first_name[0]}
                    {selectedResident.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {selectedResident.first_name} {selectedResident.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedResident.house?.address || 'No house assigned'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedResident(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleStartImpersonation}
                  disabled={isStarting}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      View as {selectedResident.first_name}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Individual resident card in the search results
 */
function ResidentCard({
  resident,
  isSelected,
  onClick,
}: {
  resident: ResidentForImpersonation;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-3 rounded-lg border text-left transition-colors',
        'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
        isSelected && 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={resident.avatar_url || undefined} />
          <AvatarFallback className="bg-muted">
            {resident.first_name[0]}
            {resident.last_name[0]}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium truncate">
              {resident.first_name} {resident.last_name}
            </p>
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {resident.resident_code}
            </Badge>
            {!resident.portal_enabled && (
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                Portal Disabled
              </Badge>
            )}
          </div>

          <div className="space-y-0.5 text-sm text-muted-foreground">
            {resident.house && (
              <div className="flex items-center gap-1.5 truncate">
                <Home className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {resident.house.short_name || resident.house.address}
                </span>
              </div>
            )}

            {resident.email && (
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{resident.email}</span>
              </div>
            )}

            {resident.phone_primary && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>{resident.phone_primary}</span>
              </div>
            )}
          </div>
        </div>

        {isSelected && (
          <div className="flex-shrink-0">
            <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
              <Eye className="h-3 w-3 text-white" />
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Button to open the impersonation selector
 * Use this in the dashboard or admin areas
 */
export function ImpersonateResidentButton({
  className,
  variant = 'outline',
  size = 'default',
}: {
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}) {
  const [open, setOpen] = useState(false);
  const { canImpersonate, isLoading } = useImpersonation();

  if (!canImpersonate && !isLoading) {
    return null;
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={className}
        disabled={isLoading}
      >
        <Eye className="h-4 w-4 mr-2" />
        View as Resident
      </Button>

      <ResidentImpersonationSelector
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => {
          // Navigate to portal after successful impersonation start
          window.location.href = '/portal';
        }}
      />
    </>
  );
}
