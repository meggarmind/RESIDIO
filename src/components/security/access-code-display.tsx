'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Eye, EyeOff, Share2, MessageCircle } from 'lucide-react';
import { AccessCodeTypeBadge, ValidityBadge } from './security-badges';
import { formatDateTime } from '@/lib/utils';
import type { AccessCode } from '@/types/database';
import { getShareMessage, getWhatsAppShareLink } from '@/lib/utils/share';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AccessCodeDisplayProps {
  code: string;
  type?: AccessCode['code_type'];
  validUntil?: string | null;
  isActive?: boolean;
  showCopy?: boolean;
  showValidity?: boolean;
  size?: 'sm' | 'md' | 'lg';
  masked?: boolean;
  showShare?: boolean;
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
  showShare = true, // Default to true if not specified, or false? Let's default true as it's a useful feature.
}: AccessCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [masked, setMasked] = useState(initialMasked);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Code copied to clipboard');
  };

  const handleShareWhatsApp = () => {
    const mockAccessCode = {
      code,
      valid_until: validUntil ?? null,
    } as AccessCode;

    const link = getWhatsAppShareLink(mockAccessCode);
    window.open(link, '_blank');
  };

  const handleCopyInvitation = async () => {
    const mockAccessCode = {
      code,
      valid_until: validUntil ?? null,
    } as AccessCode;

    const message = getShareMessage(mockAccessCode);
    await navigator.clipboard.writeText(message);
    toast.success('Invitation copied to clipboard');
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
          className={cn(
            'font-mono bg-muted/50 rounded-lg border border-border/50 code-credential',
            sizeClasses[size],
            !isActive && 'opacity-50 line-through'
          )}
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
            className="h-8 w-8 relative overflow-hidden"
            onClick={handleCopy}
            title="Copy code"
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="relative"
                >
                  <Check className="h-4 w-4 text-emerald-500" />
                  {/* Pulse glow ring */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 rounded-full bg-emerald-500/30"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                >
                  <Copy className="h-4 w-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        )}

        {showShare && isActive && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Share access code"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleShareWhatsApp}>
                <MessageCircle className="mr-2 h-4 w-4" />
                Share via WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyInvitation}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Invitation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
