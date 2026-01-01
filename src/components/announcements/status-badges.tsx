'use client';

import { Badge } from '@/components/ui/badge';
import { Clock, Send, FileText, Archive, AlertTriangle, Bell, BellRing, Megaphone } from 'lucide-react';
import type { AnnouncementStatus, AnnouncementPriority } from '@/types/database';

interface StatusBadgeProps {
  status: AnnouncementStatus;
}

interface PriorityBadgeProps {
  priority: AnnouncementPriority;
}

const STATUS_CONFIG: Record<
  AnnouncementStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof FileText }
> = {
  draft: {
    label: 'Draft',
    variant: 'secondary',
    icon: FileText,
  },
  scheduled: {
    label: 'Scheduled',
    variant: 'outline',
    icon: Clock,
  },
  published: {
    label: 'Published',
    variant: 'default',
    icon: Send,
  },
  archived: {
    label: 'Archived',
    variant: 'secondary',
    icon: Archive,
  },
};

const PRIORITY_CONFIG: Record<
  AnnouncementPriority,
  { label: string; className: string; icon: typeof Bell }
> = {
  low: {
    label: 'Low',
    className: 'bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200',
    icon: Bell,
  },
  normal: {
    label: 'Normal',
    className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200',
    icon: Bell,
  },
  high: {
    label: 'High',
    className: 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200',
    icon: BellRing,
  },
  emergency: {
    label: 'Emergency',
    className: 'bg-red-100 text-red-700 hover:bg-red-100 border-red-200',
    icon: Megaphone,
  },
};

export function AnnouncementStatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export function AnnouncementPriorityBadge({ priority }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export function TargetAudienceBadge({ audience }: { audience: string }) {
  const labels: Record<string, string> = {
    all: 'All',
    residents: 'Residents',
    owners: 'Owners',
    tenants: 'Tenants',
    staff: 'Staff',
  };

  return (
    <Badge variant="outline" className="text-xs">
      {labels[audience] || audience}
    </Badge>
  );
}
