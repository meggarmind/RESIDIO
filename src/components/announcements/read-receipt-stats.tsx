'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAnnouncementReadStats } from '@/hooks/use-announcements';
import { Eye, Users, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ReadReceiptStatsProps {
  announcementId: string;
}

export function ReadReceiptStats({ announcementId }: ReadReceiptStatsProps) {
  const { data, isLoading, error } = useAnnouncementReadStats(announcementId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Read Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Read Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load statistics</p>
        </CardContent>
      </Card>
    );
  }

  const { totalReads, readers } = data || { totalReads: 0, readers: [] };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Read Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{totalReads}</p>
              <p className="text-xs text-muted-foreground">Total Reads</p>
            </div>
          </div>
        </div>

        {readers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Recent Readers</h4>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {readers.slice(0, 10).map((reader) => (
                <div
                  key={reader.resident_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <span className="text-sm">{reader.resident_name}</span>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(reader.read_at), { addSuffix: true })}
                  </Badge>
                </div>
              ))}
            </div>
            {readers.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">
                +{readers.length - 10} more readers
              </p>
            )}
          </div>
        )}

        {readers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No one has read this announcement yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
