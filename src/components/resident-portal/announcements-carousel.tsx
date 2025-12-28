'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success';
  date: Date;
}

const typeColors = {
  info: 'from-blue-500/10 via-sky-500/5 to-transparent border-blue-500/20',
  warning: 'from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20',
  success: 'from-green-500/10 via-emerald-500/5 to-transparent border-green-500/20',
};

const typeBadgeColors = {
  info: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  warning: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  success: 'bg-green-500/20 text-green-700 dark:text-green-300',
};

interface AnnouncementsCarouselProps {
  announcements?: Announcement[];
  isLoading?: boolean;
}

export function AnnouncementsCarousel({
  announcements = [],
  isLoading,
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

  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${typeColors[current.type]}`}>
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Announcement
              </span>
            </div>
            <Badge className={`text-xs ${typeBadgeColors[current.type]}`}>
              {current.type}
            </Badge>
          </div>

          <h3 className="font-semibold mb-2">{current.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{current.content}</p>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {format(current.date, 'MMM d, yyyy')}
            </div>

            {announcements.length > 1 && (
              <div className="flex items-center gap-2">
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
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
