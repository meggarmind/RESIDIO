'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useNotificationTemplates, useNotificationSchedules } from '@/hooks/use-notifications';
import { useSettingsNavigation } from '@/hooks/use-settings-navigation';
import { isIndexChild, type SettingsItem } from '@/config/settings-nav';

/**
 * Settings landing page.
 *
 * Rendered from the same permission-filtered config as the sidebar. The
 * previous version hardcoded six cards and omitted Roles & Permissions,
 * Security, Audit Logs, Billing and System entirely — generating it means the
 * two cannot disagree about what Settings contains.
 */
export default function SettingsPage() {
  const { groups } = useSettingsNavigation();
  const { data: templates } = useNotificationTemplates();
  const { data: schedules } = useNotificationSchedules();

  const activeTemplates = templates?.filter((t) => t.is_active).length || 0;
  const totalTemplates = templates?.length || 0;
  const activeSchedules = schedules?.filter((s) => s.is_active).length || 0;

  /** Flatten a group into the pages it actually links to. */
  const linksFor = (items: SettingsItem[]): SettingsItem[] =>
    items.flatMap((item) =>
      item.children
        ? // Skip an index child that just repeats its parent's href.
          item.children.filter((child) => !isIndexChild(item, child) || item.children!.length === 1)
        : [item]
    );

  const dataManagementVisible = groups.some((g) =>
    linksFor(g.items).some((i) => i.href === '/settings/data-management')
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Settings Overview</h3>
        <p className="text-sm text-muted-foreground">
          Configure your estate management system. Select a section below to get started.
        </p>
      </div>

      {groups.map((group) => {
        const links = linksFor(group.items).filter((item) => item.href !== '/settings');
        if (links.length === 0) return null;

        return (
          <section key={group.title} className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <group.icon className="h-4 w-4" />
              {group.title}
            </h4>
            <div className="grid gap-4 md:grid-cols-2">
              {links.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      {item.description && (
                        <CardDescription>{item.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        {item.href === '/settings/notifications' ? (
                          <div className="flex items-center gap-2">
                            <Badge variant={activeTemplates > 0 ? 'default' : 'outline'}>
                              {activeTemplates}/{totalTemplates} templates
                            </Badge>
                            <Badge variant={activeSchedules > 0 ? 'default' : 'outline'}>
                              {activeSchedules} schedules
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Open</span>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {dataManagementVisible && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <h4 className="font-medium text-amber-800 dark:text-amber-200">
                  Data Management Note
                </h4>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  The data management section contains administrative tools that modify
                  historical records. Use with caution and ensure you have backups before making
                  changes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
