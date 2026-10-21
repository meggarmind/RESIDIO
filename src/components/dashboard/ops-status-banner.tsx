'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOpsStatus } from '@/hooks/use-ops-status';

export const OPS_STATUS_MESSAGES = [
  {
    key: 'maintenance',
    text: 'Maintenance mode is ON. Non-admin users are locked out.',
    href: '/settings/maintenance',
  },
  {
    key: 'commsOverride',
    text: 'Communications override is ON. Messages go to override contacts, not residents.',
    href: '/settings/sending#testing',
  },
] as const;

/** Persistent, non-dismissible notice that a state affecting every user is on (#789). */
export function OpsStatusBanner() {
  const status = useOpsStatus();
  const active = OPS_STATUS_MESSAGES.filter((message) => status[message.key]);
  if (active.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-4">
      {active.map((message) => (
        <Alert
          key={message.key}
          variant="warning"
          role="status"
          // The warning variant's text colour is for a solid amber fill; on its 10% tint it is unreadable.
          className="text-foreground *:data-[slot=alert-description]:text-foreground"
        >
          <AlertTriangle />
          <AlertDescription>
            <span>
              {message.text}{' '}
              <Link href={message.href} className="font-medium underline underline-offset-4">
                Open settings
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
