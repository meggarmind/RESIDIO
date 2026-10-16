'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSystemActionLog, type SystemActionOutcome } from '@/actions/system/action-log';
import { ActionLogTable } from '@/components/system/action-log-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_VALUE = '_all';
const LIMIT = 25;

interface FilterState {
  source: string;
  outcome: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FILTERS: FilterState = { source: '', outcome: ALL_VALUE, startDate: '', endDate: '' };

export default function SystemActionLogPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['system-action-log', applied, page],
    queryFn: () =>
      getSystemActionLog({
        source: applied.source || undefined,
        outcome: applied.outcome === ALL_VALUE ? undefined : (applied.outcome as SystemActionOutcome),
        startDate: applied.startDate ? new Date(`${applied.startDate}T00:00:00`).toISOString() : undefined,
        endDate: applied.endDate ? new Date(`${applied.endDate}T23:59:59.999`).toISOString() : undefined,
        page,
        limit: LIMIT,
      }),
  });

  // Either the action threw (queryError) or it returned { error } (data.error).
  const loadError = queryError
    ? queryError.message || 'Request failed'
    : (data?.error ?? null);

  const hasFilters =
    !!applied.source || applied.outcome !== ALL_VALUE || !!applied.startDate || !!applied.endDate;

  const apply = () => {
    setApplied(draft);
    setPage(1);
  };
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Action Log</h3>
        <p className="text-sm text-muted-foreground">
          What automated processes (cron jobs and webhooks) did, and whether it worked. Only
          super administrators can view this page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Log</CardTitle>
          <CardDescription>Narrow the log by source, outcome or date</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="log-source">Source</Label>
              <Input
                id="log-source"
                placeholder="e.g. cron:"
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-outcome">Outcome</Label>
              <Select value={draft.outcome} onValueChange={(v) => setDraft({ ...draft, outcome: v })}>
                <SelectTrigger id="log-outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All outcomes</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-from">From</Label>
              <Input
                id="log-from"
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-to">To</Label>
              <Input
                id="log-to"
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={apply}>Apply</Button>
              <Button variant="outline" onClick={clear}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automated Actions</CardTitle>
          <CardDescription>
            {loadError
              ? 'Unable to load entries'
              : data?.data
                ? `${data.data.total} total entries, newest first`
                : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionLogTable
            rows={data?.data?.data ?? null}
            total={data?.data?.total ?? 0}
            page={page}
            limit={LIMIT}
            isLoading={isLoading}
            error={loadError}
            hasFilters={hasFilters}
            onPageChange={setPage}
            onClearFilters={clear}
          />
        </CardContent>
      </Card>
    </div>
  );
}
