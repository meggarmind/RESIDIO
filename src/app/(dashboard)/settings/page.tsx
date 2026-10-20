'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Circle, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SettingsEmptyState, SettingsSkeleton } from '@/components/settings/settings-states';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';
import { useOpsStatus } from '@/hooks/use-ops-status';
import { getSetupStatus } from '@/actions/settings/get-setup-status';
import { summarizeSetup } from '@/lib/settings/setup-checklist';
import { SETTINGS_SEARCH_ENTRIES, matchSettingsEntries } from '@/lib/search/settings-search-entries';
import type { SettingsItem } from '@/config/settings-nav';

/** Every page a group links to: parents are labels, so their children stand in for them. */
const linksFor = (items: SettingsItem[]): SettingsItem[] =>
  items.flatMap((item) => item.children ?? [item]).filter((item) => item.href !== '/settings');

/**
 * Settings landing page.
 *
 * Rendered from the same permission-filtered config as the sidebar, so the two
 * cannot disagree about what Settings contains. Every page gets a card,
 * including a group's index page (Billing Settings, Email Configuration,
 * Security Settings), which an earlier version filtered out (#786).
 */
export default function SettingsPage() {
  const { groups, isLoading } = useSettingsNavigation();
  const opsStatus = useOpsStatus();
  const [query, setQuery] = useState('');
  const { data: setupStatus } = useQuery({
    queryKey: ['settings', 'setup-status'],
    queryFn: async () => {
      const result = await getSetupStatus();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });

  const visible = useMemo(
    () => groups.map((group) => ({ group, links: linksFor(group.items) })).filter(({ links }) => links.length > 0),
    [groups]
  );
  const visibleHrefs = useMemo(() => new Set(visible.flatMap(({ links }) => links.map((l) => l.href))), [visible]);
  const matches = useMemo(() => {
    const entries = SETTINGS_SEARCH_ENTRIES.filter((entry) => visibleHrefs.has(entry.href));
    return matchSettingsEntries(entries, query);
  }, [visibleHrefs, query]);

  if (isLoading) return <SettingsSkeleton rows={6} />;

  const setup = setupStatus ? summarizeSetup(setupStatus) : null;
  const stepDone = new Map<string, boolean>(setup?.steps.map((step) => [step.href, step.done]));
  // Cards whose state changes what every user gets (#789); the same state the dashboard banner shows.
  const isOn: Record<string, boolean> = {
    '/settings/maintenance': opsStatus.maintenance,
    '/settings/comms-override': opsStatus.commsOverride,
  };

  const statusChip = (href: string) => {
    if (isOn[href]) return <Badge variant="warning">ON</Badge>;
    const done = stepDone.get(href);
    if (done === undefined) return null;
    return done ? <Badge variant="success">Set up</Badge> : <Badge variant="outline">Not set up</Badge>;
  };

  const renderCard = (item: { href: string; title: string; description?: string }) => (
    <Link key={item.href} href={item.href}>
      <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">{item.title}</CardTitle>
          {item.description && <CardDescription>{item.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {statusChip(item.href) ?? <span />}
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );

  return (
    <div className="space-y-6">
      <SettingsPageHeader description="Find a setting below, or search for it by name." />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings, e.g. late fee or logo"
          aria-label="Search settings"
          className="pl-9"
        />
      </div>

      {query.trim() ? (
        matches.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {matches.map((entry) => renderCard({ href: entry.href, title: entry.title, description: entry.subtitle }))}
          </div>
        ) : (
          <SettingsEmptyState icon={Search} title="No settings match" description="Try a different word." />
        )
      ) : (
        <>
          {setup && !setup.complete && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Setup checklist</CardTitle>
                <CardDescription>
                  {setup.done} of {setup.total} done
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {setup.steps.map((step) => {
                    const Icon = step.done ? CheckCircle2 : Circle;
                    const label = (
                      <>
                        <Icon
                          className={step.done ? 'h-4 w-4 text-success' : 'h-4 w-4 text-muted-foreground'}
                          aria-hidden="true"
                        />
                        <span className={step.done ? 'text-muted-foreground line-through' : undefined}>{step.title}</span>
                        <span className="sr-only">{step.done ? '(done)' : '(to do)'}</span>
                      </>
                    );
                    return (
                      <li key={step.id}>
                        {/* A step on a page this admin cannot open is shown, not linked. */}
                        {visibleHrefs.has(step.href) ? (
                          <Link href={step.href} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted/50">
                            {label}
                          </Link>
                        ) : (
                          <div className="flex min-h-11 items-center gap-2 px-2 text-sm">{label}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {visible.map(({ group, links }) => (
            <section key={group.title} className="space-y-3">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <group.icon className="h-4 w-4" />
                {group.title}
              </h4>
              <div className="grid gap-4 md:grid-cols-2">{links.map(renderCard)}</div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
