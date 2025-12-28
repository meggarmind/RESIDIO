'use client';

import { Badge } from '@/components/ui/badge';
import { FileText, FolderOpen, Users } from 'lucide-react';
import type { DocumentCategory } from '@/types/database';

interface CategoryBadgeProps {
  category: DocumentCategory | null;
  showIcon?: boolean;
  className?: string;
}

// Category color mapping based on name patterns
const getCategoryColor = (name: string): string => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('policy') || lowerName.includes('policies')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (lowerName.includes('bylaw')) {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
  }
  if (lowerName.includes('financial') || lowerName.includes('report')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (lowerName.includes('notice')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (lowerName.includes('form')) {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  }
  if (lowerName.includes('minute')) {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
};

export function CategoryBadge({ category, showIcon = false, className = '' }: CategoryBadgeProps) {
  if (!category) {
    return (
      <Badge variant="outline" className={`text-muted-foreground ${className}`}>
        <FolderOpen className="h-3 w-3 mr-1" />
        Uncategorized
      </Badge>
    );
  }

  const colorClass = getCategoryColor(category.name);

  return (
    <Badge
      variant="secondary"
      className={`${colorClass} border-0 ${className}`}
    >
      {showIcon && <FileText className="h-3 w-3 mr-1" />}
      {category.name}
      {category.is_resident_accessible && (
        <span title="Visible to residents">
          <Users className="h-3 w-3 ml-1 opacity-60" />
        </span>
      )}
    </Badge>
  );
}

// Separate component for file type badges
interface FileTypeBadgeProps {
  mimeType: string | null;
  className?: string;
}

const getFileTypeInfo = (mimeType: string | null): { label: string; color: string } => {
  switch (mimeType) {
    case 'application/pdf':
      return { label: 'PDF', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' };
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return { label: 'DOCX', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return { label: 'XLSX', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
    case 'text/plain':
      return { label: 'TXT', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
    default:
      return { label: 'File', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  }
};

export function FileTypeBadge({ mimeType, className = '' }: FileTypeBadgeProps) {
  const { label, color } = getFileTypeInfo(mimeType);

  return (
    <Badge variant="secondary" className={`${color} border-0 font-mono text-xs ${className}`}>
      {label}
    </Badge>
  );
}
