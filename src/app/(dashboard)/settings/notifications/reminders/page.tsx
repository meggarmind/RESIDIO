'use client';

/**
 * Invoice Payment Reminders Overview
 *
 * Shows the current status of the reminder system and links to schedule configuration.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  Bell,
  Clock,
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import {
  getReminderSettings,
  toggleRemindersEnabled,
} from '@/actions/notifications/reminder-config';
import type { ReminderScheduleConfig } from '@/lib/notifications/types';
import { toast } from 'sonner';

function formatDaysFromDue(days: number): string {
  if (days === 0) return 'On due date';
  if (days === 1) return '1 day before';
  return `${days} days before`;
}

function getEscalationBadgeVariant(step: number): 'default' | 'secondary' | 'destructive' {
  if (step <= 2) return 'default';
  if (step <= 4) return 'secondary';
  return 'destructive';
}

export default function RemindersOverviewPage() {
  const [schedule, setSchedule] = useState<ReminderScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);

  const loadSettings = async () => {
    try {
      const settings = await getReminderSettings();
      setSchedule(settings.schedule);
      setLastRun(settings.lastRun);
      setEnabled(settings.enabled);
    } catch {
      toast.error('Failed to load reminder settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggleEnabled = async () => {
    try {
      const result = await toggleRemindersEnabled();
      if (result.success) {
        setEnabled(result.enabled!);
        toast.success(`Reminders ${result.enabled ? 'enabled' : 'disabled'}`);
      } else {
        toast.error(result.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update reminder settings');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const steps = schedule?.steps || [];
  const activeSteps = steps.filter(s => s.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Payment Reminders
          </h3>
          <p className="text-sm text-muted-foreground">
            Automated reminder escalation for invoice payments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="enable-reminders" className="text-sm">Enable Reminders</Label>
          <Switch
            id="enable-reminders"
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
          />
        </div>
      </div>

      <Separator />

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={enabled ? 'default' : 'outline'}>
                {enabled ? (
                  <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
                ) : (
                  <><XCircle className="h-3 w-3 mr-1" /> Disabled</>
                )}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Active Steps</p>
              <p className="font-medium">{activeSteps.length} of {steps.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Last Run</p>
              <p className="font-medium text-sm">
                {lastRun ? new Date(lastRun).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Preview */}
      {activeSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Schedule</CardTitle>
            <CardDescription>
              Quick overview of active reminder steps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeSteps.map((step, index) => (
                <div key={step.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant={getEscalationBadgeVariant(index + 1)}>
                      {index + 1}
                    </Badge>
                    <span className="text-sm">{formatDaysFromDue(step.daysFromDue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {step.channels.map((channel) => (
                      <Badge key={channel} variant="secondary" className="text-xs capitalize">
                        {channel}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configure Schedule Button */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Configure Schedule</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Add, edit, or remove reminder steps and change the escalation schedule.
              </p>
            </div>
            <Button asChild>
              <Link href="/settings/notifications/reminders/schedule">
                <Clock className="h-4 w-4 mr-2" />
                Configure
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">1</Badge>
                <span className="font-medium text-sm">Invoice Generation</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Monthly invoices are generated on the configured day with a due date.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">2</Badge>
                <span className="font-medium text-sm">Reminder Escalation</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Reminders are sent according to the schedule, escalating as the due date approaches.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">3</Badge>
                <span className="font-medium text-sm">Overdue Processing</span>
              </div>
              <p className="text-xs text-muted-foreground">
                After the due date, late fees may be applied based on your billing configuration.
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Email and SMS delivery will be implemented in a future phase. For now, reminders are
              configured and ready to send when the notification system is connected.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
