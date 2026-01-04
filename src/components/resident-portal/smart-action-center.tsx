'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Wallet,
  Shield,
  UserPlus,
  Mail,
  Phone,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface SmartAction {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  priority: number; // Higher = more important
  badge?: string;
}

interface SmartActionCenterProps {
  /**
   * Number of unpaid invoices
   */
  unpaidInvoices?: number;
  /**
   * Total amount unpaid
   */
  totalUnpaid?: number;
  /**
   * Wallet balance
   */
  walletBalance?: number;
  /**
   * Number of expiring security contacts (within 7 days)
   */
  expiringContacts?: number;
  /**
   * Whether email is verified
   */
  emailVerified?: boolean;
  /**
   * Whether phone is verified
   */
  phoneVerified?: boolean;
  /**
   * Whether user is primary resident
   */
  isPrimaryResident?: boolean;
  /**
   * Number of household members
   */
  householdMembers?: number;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Maximum number of actions to show (defaults to 3)
   */
  maxActions?: number;
}

/**
 * SmartActionCenter Component
 *
 * Context-aware widget that suggests relevant actions based on the resident's current state.
 * Shows the most important actions sorted by priority.
 *
 * @example
 * ```tsx
 * <SmartActionCenter
 *   unpaidInvoices={3}
 *   totalUnpaid={5000}
 *   walletBalance={1000}
 *   emailVerified={false}
 *   isPrimaryResident={true}
 *   householdMembers={0}
 * />
 * ```
 */
export function SmartActionCenter({
  unpaidInvoices = 0,
  totalUnpaid = 0,
  walletBalance = 0,
  expiringContacts = 0,
  emailVerified = true,
  phoneVerified = true,
  isPrimaryResident = false,
  householdMembers = 0,
  className,
  maxActions = 3,
}: SmartActionCenterProps) {
  const [dismissedActions, setDismissedActions] = useState<string[]>([]);

  // Load dismissed actions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('dismissed_smart_actions');
    if (stored) {
      try {
        setDismissedActions(JSON.parse(stored));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Calculate suggested actions based on context
  const suggestedActions = useMemo(() => {
    const actions: SmartAction[] = [];

    // Critical: Unpaid invoices
    if (unpaidInvoices > 0) {
      actions.push({
        id: 'pay_invoices',
        title: `Pay ${unpaidInvoices} invoice${unpaidInvoices > 1 ? 's' : ''}`,
        description: `₦${totalUnpaid.toLocaleString()} outstanding`,
        icon: CreditCard,
        href: '/portal/invoices',
        variant: 'destructive',
        priority: 100,
        badge: 'Urgent',
      });
    }

    // High: Low wallet balance with unpaid invoices
    if (unpaidInvoices > 0 && walletBalance < totalUnpaid) {
      const shortfall = totalUnpaid - walletBalance;
      actions.push({
        id: 'top_up_wallet',
        title: 'Top up wallet',
        description: `Need ₦${shortfall.toLocaleString()} more to clear balance`,
        icon: Wallet,
        href: '/portal/invoices', // Will show wallet top-up option
        variant: 'default',
        priority: 90,
      });
    }

    // Medium: Expiring security contacts
    if (expiringContacts > 0) {
      actions.push({
        id: 'renew_contacts',
        title: `${expiringContacts} contact${expiringContacts > 1 ? 's' : ''} expiring soon`,
        description: 'Renew before access is revoked',
        icon: Shield,
        href: '/portal/security-contacts',
        variant: 'outline',
        priority: 70,
        badge: 'Soon',
      });
    }

    // Medium: Unverified email
    if (!emailVerified) {
      actions.push({
        id: 'verify_email',
        title: 'Verify your email',
        description: 'Get important notifications and updates',
        icon: Mail,
        href: '/portal/profile',
        variant: 'outline',
        priority: 60,
      });
    }

    // Medium: Unverified phone
    if (!phoneVerified) {
      actions.push({
        id: 'verify_phone',
        title: 'Verify your phone',
        description: 'Enable SMS notifications',
        icon: Phone,
        href: '/portal/profile',
        variant: 'outline',
        priority: 55,
      });
    }

    // Low: No household members (for primary residents)
    if (isPrimaryResident && householdMembers === 0) {
      actions.push({
        id: 'add_household',
        title: 'Add household members',
        description: 'Share access with family members',
        icon: UserPlus,
        href: '/portal/profile',
        variant: 'secondary',
        priority: 40,
      });
    }

    // Filter out dismissed actions and sort by priority
    return actions
      .filter(action => !dismissedActions.includes(action.id))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxActions);
  }, [
    unpaidInvoices,
    totalUnpaid,
    walletBalance,
    expiringContacts,
    emailVerified,
    phoneVerified,
    isPrimaryResident,
    householdMembers,
    dismissedActions,
    maxActions,
  ]);

  // Dismiss an action
  const dismissAction = (actionId: string) => {
    const updated = [...dismissedActions, actionId];
    setDismissedActions(updated);
    localStorage.setItem('dismissed_smart_actions', JSON.stringify(updated));
  };

  // Don't render if no actions
  if (suggestedActions.length === 0) {
    return null;
  }

  return (
    <Card className={cn('border-primary/20 bg-gradient-to-br from-primary/5 to-transparent', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Suggested Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <AnimatePresence mode="popLayout">
          {suggestedActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="group relative">
                  <Link href={action.href}>
                    <Button
                      variant={action.variant}
                      className="w-full justify-start h-auto p-3 relative overflow-hidden"
                    >
                      <div className="flex items-start gap-3 flex-1 text-left">
                        <div className="p-1.5 rounded-md bg-background/10 shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm">{action.title}</span>
                            {action.badge && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 h-4"
                              >
                                {action.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs opacity-80 line-clamp-1">
                            {action.description}
                          </p>
                        </div>
                      </div>
                    </Button>
                  </Link>

                  {/* Dismiss button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      dismissAction(action.id);
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md hover:bg-background/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {dismissedActions.length > 0 && (
          <button
            onClick={() => {
              setDismissedActions([]);
              localStorage.removeItem('dismissed_smart_actions');
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center pt-2"
          >
            Show dismissed actions ({dismissedActions.length})
          </button>
        )}
      </CardContent>
    </Card>
  );
}
