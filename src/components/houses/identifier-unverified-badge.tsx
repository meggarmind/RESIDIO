'use client';

import { HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface IdentifierUnverifiedBadgeProps {
  /** The `identifier_unverified` column on the house row. */
  unverified: boolean | null | undefined;
  /** Optional `identifier_note` context, surfaced in the tooltip. */
  note?: string | null;
  className?: string;
}

/**
 * Issue #119 -- marks a house whose recorded identifier is doubted.
 *
 * Reads the explicit `identifier_unverified` column. It deliberately does NOT
 * look for `?` in the identifier: the owner rejected deriving the flag from
 * the string, because a doubted identifier need not contain one.
 */
export function IdentifierUnverifiedBadge({
  unverified,
  note,
  className,
}: IdentifierUnverifiedBadgeProps) {
  if (!unverified) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={
            'gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 ' +
            (className ?? '')
          }
          data-testid="identifier-unverified-badge"
        >
          <HelpCircle className="h-3 w-3" aria-hidden="true" />
          Needs confirmation
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {note || 'This house identifier was recorded with doubt and has not been confirmed.'}
      </TooltipContent>
    </Tooltip>
  );
}
