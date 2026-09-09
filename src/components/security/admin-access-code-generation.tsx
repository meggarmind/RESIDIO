'use client';

import { Clock, Key, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AccessCodeTypeBadge } from '@/components/security/security-badges';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AccessCodeType } from '@/types/database';

const FALLBACK_VALIDITY_DAYS = 30;

interface AdminAccessCodeGenerationMenuProps {
  defaultValidityDays: number | null | undefined;
  isPending: boolean;
  onGenerate: (codeType: AccessCodeType) => Promise<void>;
  triggerLabel?: string;
  triggerSize?: 'default' | 'sm';
}

export function AdminAccessCodeGenerationMenu({
  defaultValidityDays,
  isPending,
  onGenerate,
  triggerLabel = 'Generate Code',
  triggerSize = 'default',
}: AdminAccessCodeGenerationMenuProps) {
  const validityDays = defaultValidityDays || FALLBACK_VALIDITY_DAYS;

  const handleGenerate = async (codeType: AccessCodeType) => {
    try {
      await onGenerate(codeType);
      toast.success(
        `${codeType === 'permanent' ? 'Multi-use' : 'One-time'} code generated successfully`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate code');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={triggerSize === 'sm' ? 'outline' : 'default'} size={triggerSize} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Key className="mr-2 h-4 w-4" />
          )}
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void handleGenerate('permanent')}>
          <Clock className="mr-2 h-4 w-4" />
          <span>
            <span className="block">Multi-use Code</span>
            <span className="block text-xs text-muted-foreground">
              Valid for {validityDays} {validityDays === 1 ? 'day' : 'days'} from generation
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleGenerate('one_time')}>
          <RefreshCw className="mr-2 h-4 w-4" />
          One-Time Code
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminAccessCodeTypeBadge({ type }: { type: AccessCodeType }) {
  return <AccessCodeTypeBadge type={type} label={type === 'permanent' ? 'Multi-use' : undefined} />;
}
