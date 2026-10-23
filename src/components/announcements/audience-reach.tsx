'use client';

import { Loader2, Users } from 'lucide-react';
import { useAnnouncementReach } from '@/hooks/use-announcements';

/** "Will reach N, M have WhatsApp opt-in" for a resident-group audience (#1095). */
export function AudienceReach({ groupSlug }: { groupSlug: string | null | undefined }) {
  const { data, isLoading, error } = useAnnouncementReach(groupSlug);
  if (!groupSlug) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm" role="status">
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4 text-muted-foreground" />}
      {isLoading && <span>Counting recipients...</span>}
      {error && <span className="text-destructive">Could not count recipients</span>}
      {data && (
        <span>
          Will reach <strong>{data.reach}</strong>, {data.optedIn} {data.optedIn === 1 ? 'has' : 'have'} WhatsApp opt-in
        </span>
      )}
    </div>
  );
}
