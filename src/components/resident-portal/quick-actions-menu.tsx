'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Grid, CreditCard, Wallet, UserPlus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { WalletTopUpDialog } from './wallet-topup-dialog';
import { VisitorAccessDialog } from './visitor-access-dialog';
import { StatementGeneratorDialog } from '@/components/billing/statement-generator-dialog';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick?: () => void;
  href?: string;
}

/**
 * Quick Actions Menu Component
 *
 * Provides quick access to common resident tasks via a dropdown menu.
 * Desktop only (hidden on mobile/tablet).
 *
 * Actions:
 * - Pay Invoice → Navigate to invoices page
 * - Top Up Wallet → Open wallet top-up dialog
 * - Register Visitor → Open visitor access dialog
 * - Account Statement → Open statement generator dialog
 */
export function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false);
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);

  const actions: QuickAction[] = [
    {
      icon: CreditCard,
      label: 'Pay Invoice',
      description: 'Pay an outstanding bill',
      href: '/portal/invoices',
    },
    {
      icon: Wallet,
      label: 'Top Up Wallet',
      description: 'Add funds to your wallet',
      onClick: () => {
        setOpen(false);
        setWalletDialogOpen(true);
      },
    },
    {
      icon: UserPlus,
      label: 'Register Visitor',
      description: 'Pre-register a guest',
      onClick: () => {
        setOpen(false);
        setVisitorDialogOpen(true);
      },
    },
    {
      icon: FileText,
      label: 'Account Statement',
      description: 'Download statement',
      onClick: () => {
        setOpen(false);
        setStatementDialogOpen(true);
      },
    },
  ];

  const handleActionClick = (action: QuickAction) => {
    if (action.onClick) {
      action.onClick();
    } else if (action.href) {
      setOpen(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
            }}
            aria-label="Quick actions menu"
          >
            <Grid
              style={{
                width: 'var(--icon-sm)',
                height: 'var(--icon-sm)',
                color: 'var(--color-text-muted)',
              }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="end">
          <div className="flex flex-col">
            {/* Header */}
            <div className="p-4 pb-3">
              <h3
                className="font-semibold"
                style={{
                  fontSize: 'var(--text-base)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Quick Actions
              </h3>
            </div>

            {/* Action List */}
            <div className="p-2 space-y-1">
              {actions.map((action, index) => {
                const Icon = action.icon;
                const content = (
                  <div
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg transition-colors',
                      'hover:bg-muted/50 cursor-pointer'
                    )}
                    onClick={() => !action.href && handleActionClick(action)}
                  >
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: 'var(--color-bg-input)',
                      }}
                    >
                      <Icon
                        style={{
                          width: 'var(--icon-sm)',
                          height: 'var(--icon-sm)',
                          color: 'var(--color-text-secondary)',
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-medium mb-0.5"
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {action.label}
                      </p>
                      <p
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {action.description}
                      </p>
                    </div>
                  </div>
                );

                // If action has href, wrap in Link
                if (action.href) {
                  return (
                    <Link
                      key={index}
                      href={action.href}
                      onClick={() => handleActionClick(action)}
                    >
                      {content}
                    </Link>
                  );
                }

                // Otherwise, render as button
                return <div key={index}>{content}</div>;
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Dialogs */}
      <WalletTopUpDialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen} />
      <VisitorAccessDialog open={visitorDialogOpen} onOpenChange={setVisitorDialogOpen} />
      <StatementGeneratorDialog
        open={statementDialogOpen}
        onOpenChange={setStatementDialogOpen}
      />
    </>
  );
}
