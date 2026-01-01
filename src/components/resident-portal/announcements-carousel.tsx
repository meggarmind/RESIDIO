'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ChevronLeft, ChevronRight, Calendar, ArrowRight, AlertTriangle, Info } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AnnouncementWithRelations, AnnouncementPriority } from '@/types/database';

// Map priority to visual styles (uses 'emergency' not 'urgent')
const priorityStyles: Record<string, string> = {
  emergency: 'from-red-500/10 via-red-500/5 to-transparent border-red-500/30',
  high: 'from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20',
  normal: 'from-blue-500/10 via-sky-500/5 to-transparent border-blue-500/20',
  low: 'from-slate-500/10 via-slate-500/5 to-transparent border-slate-500/20',
};

const priorityBadgeStyles: Record<string, string> = {
  emergency: 'bg-red-500/20 text-red-700 dark:text-red-300',
  high: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  normal: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  low: 'bg-slate-500/20 text-slate-700 dark:text-slate-300',
};

const priorityIcons: Record<string, React.ElementType> = {
  emergency: AlertTriangle,
  high: AlertTriangle,
  normal: Info,
  low: Info,
};

interface AnnouncementsCarouselProps {
  announcements?: AnnouncementWithRelations[];
  isLoading?: boolean;
  showViewAll?: boolean;
}

export function AnnouncementsCarousel({
  announcements = [],
  isLoading,
  showViewAll = true,
}: AnnouncementsCarouselProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % announcements.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + announcements.length) % announcements.length);
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="p-6 animate-pulse">
            <div className="h-5 w-32 bg-muted rounded mb-3" />
            <div className="h-4 w-full bg-muted rounded mb-2" />
            <div className="h-4 w-3/4 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (announcements.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="p-3 rounded-full bg-muted mb-3">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No announcements</p>
            <p className="text-xs text-muted-foreground mt-1">
              Estate updates will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const current = announcements[currentIndex];
  const priority = (current.priority || 'normal') as AnnouncementPriority;
  const PriorityIcon = priorityIcons[priority] || Info;
  const publishedDate = current.published_at
    ? new Date(current.published_at)
    : current.created_at
      ? new Date(current.created_at)
      : new Date();

  return (
    <Card className={cn('overflow-hidden bg-gradient-to-br', priorityStyles[priority])}>
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Announcement
              </span>
            </div>
            <div className="flex items-center gap-2">
              {current.is_pinned && (
                <Badge variant="secondary" className="text-xs">
                  Pinned
                </Badge>
              )}
              {priority !== 'normal' && (
                <Badge className={cn('text-xs capitalize', priorityBadgeStyles[priority])}>
                  <PriorityIcon className="h-3 w-3 mr-1" />
                  {priority}
                </Badge>
              )}
              {current.category && (
                <Badge variant="outline" className="text-xs">
                  {current.category.name}
                </Badge>
              )}
            </div>
          </div>

          <h3 className="font-semibold mb-2 line-clamp-1">{current.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {current.summary || current.content}
          </p>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span title={format(publishedDate, 'PPpp')}>
                {formatDistanceToNow(publishedDate, { addSuffix: true })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {announcements.length > 1 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {currentIndex + 1} / {announcements.length}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={prev}
                      aria-label="Previous announcement"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={next}
                      aria-label="Next announcement"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
              {showViewAll && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                  <Link href="/portal/announcements">
                    View all
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
