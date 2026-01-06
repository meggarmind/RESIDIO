'use client';

import { Badge } from '@/components/ui/badge';
import {
  FileText,
  FileCheck,
  AlertTriangle,
  Bell,
  DollarSign,
  Shield,
  Wrench,
  Scale,
} from 'lucide-react';
import type { NoteCategory } from '@/types/database';
import { NOTE_CATEGORY_LABELS, NOTE_CATEGORY_COLORS } from '@/types/database';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<NoteCategory, React.ElementType> = {
  general: FileText,
  agreement: FileCheck,
  complaint: AlertTriangle,
  reminder: Bell,
  financial: DollarSign,
  security: Shield,
  maintenance: Wrench,
  legal: Scale,
};

interface NoteCategoryBadgeProps {
  category: NoteCategory;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'default';
}

export function NoteCategoryBadge({
  category,
  className,
  showIcon = true,
  size = 'default',
}: NoteCategoryBadgeProps) {
  const Icon = CATEGORY_ICONS[category];
  const colorClass = NOTE_CATEGORY_COLORS[category];
  const label = NOTE_CATEGORY_LABELS[category];

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        size === 'sm' && 'text-xs px-1.5 py-0',
        className
      )}
    >
      {showIcon && <Icon className={cn('mr-1', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />}
      {label}
    </Badge>
  );
}

interface ConfidentialBadgeProps {
  className?: string;
}

export function ConfidentialBadge({ className }: ConfidentialBadgeProps) {
  return (
    <Badge
      variant="destructive"
      className={cn('text-xs', className)}
    >
      <Shield className="h-3 w-3 mr-1" />
      Confidential
    </Badge>
  );
}
