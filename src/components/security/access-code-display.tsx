'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import { AccessCodeTypeBadge, ValidityBadge } from './security-badges';
import { formatDateTime } from '@/lib/utils';
import type { AccessCode } from '@/types/database';

interface AccessCodeDisplayProps {
  code: string;
  type?: AccessCode['code_type'];
  validUntil?: string | null;
  isActive?: boolean;
  showCopy?: boolean;
  showValidity?: boolean;
  size?: 'sm' | 'md' | 'lg';
  masked?: boolean;
}

export function AccessCodeDisplay({
  code,
  type,
  validUntil,
  isActive = true,
  showCopy = true,
  showValidity = false,
  size = 'md',
  masked: initialMasked = false,
}: AccessCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [masked, setMasked] = useState(initialMasked);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sizeClasses = {
    sm: 'text-sm px-2 py-1',
    md: 'text-base px-3 py-2',
    lg: 'text-lg px-4 py-3',
  };

  const displayCode = masked ? '•••-•••-••••' : code;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <code
          className={`font-mono bg-muted rounded-md border ${sizeClasses[size]} ${
            !isActive ? 'opacity-50 line-through' : ''
          }`}
        >
          {displayCode}
        </code>

        {initialMasked && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMasked(!masked)}
            title={masked ? 'Show code' : 'Hide code'}
          >
            {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        )}

        {showCopy && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {(type || showValidity) && (
        <div className="flex items-center gap-2">
          {type && <AccessCodeTypeBadge type={type} />}
          {showValidity && validUntil !== undefined && (
            <ValidityBadge validUntil={validUntil} isActive={isActive} />
          )}
        </div>
      )}
    </div>
  );
}

interface AccessCodeCardProps {
  accessCode: AccessCode;
  onRevoke?: () => void;
  onRegenerate?: () => void;
}

export function AccessCodeCard({ accessCode, onRevoke, onRegenerate }: AccessCodeCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between">
        <AccessCodeDisplay
          code={accessCode.code}
          type={accessCode.code_type}
          validUntil={accessCode.valid_until}
          isActive={accessCode.is_active}
          showValidity
        />

        {showActions && accessCode.is_active && (onRevoke || onRegenerate) && (
          <div className="flex gap-2">
            {onRegenerate && (
              <Button variant="outline" size="sm" onClick={onRegenerate}>
                Regenerate
              </Button>
            )}
            {onRevoke && (
              <Button variant="destructive" size="sm" onClick={onRevoke}>
                Revoke
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        <p>Created: {formatDateTime(accessCode.created_at)}</p>
        {accessCode.max_uses !== null && (
          <p>Uses: {accessCode.current_uses} / {accessCode.max_uses}</p>
        )}
        {accessCode.revoked_at && (
          <p className="text-destructive">
            Revoked: {formatDateTime(accessCode.revoked_at)}
          </p>
        )}
      </div>
    </div>
  );
}
