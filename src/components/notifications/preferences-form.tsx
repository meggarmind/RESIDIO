'use client';

/**
 * Notification Preferences Form Component
 *
 * Allows residents to configure their notification preferences per category and channel.
 * Shows email as active, SMS/WhatsApp as "Coming soon".
 */

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  MessageSquare,
  Phone,
  Bell,
  Clock,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useResidentPreferences, useUpdateResidentPreference } from '@/hooks/use-notifications';
import type { UpdatePreferencesInput } from '@/lib/notifications/types';
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
  PREFERENCE_FREQUENCY_LABELS,
  isChannelImplemented,
  type NotificationCategory,
  type NotificationChannel,
  type PreferenceFrequency,
} from '@/lib/notifications/types';

interface PreferencesFormProps {
  residentId: string;
  readOnly?: boolean;
}

const CATEGORIES: NotificationCategory[] = ['payment', 'invoice', 'security', 'general'];
const CHANNELS: NotificationChannel[] = ['email', 'sms', 'whatsapp'];

function getChannelIcon(channel: NotificationChannel) {
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4" />;
    case 'whatsapp':
      return <Phone className="h-4 w-4" />;
  }
}

export function PreferencesForm({ residentId, readOnly = false }: PreferencesFormProps) {
  const { data: preferences, isLoading } = useResidentPreferences(residentId);
  const updatePreference = useUpdateResidentPreference();
  const [isSaving, setIsSaving] = useState(false);

  const [pendingChanges, setPendingChanges] = useState<
    Map<string, { enabled?: boolean; frequency?: PreferenceFrequency }>
  >(new Map());

  // Get preference for a specific category/channel combo
  const getPreference = (category: NotificationCategory, channel: NotificationChannel) => {
    const pref = preferences?.find(
      (p) => p.category === category && p.channel === channel
    );
    return pref || {
      enabled: channel === 'email', // Email enabled by default
      frequency: 'all' as PreferenceFrequency,
    };
  };

  // Check if there's a pending change for this combo
  const getPendingChange = (category: NotificationCategory, channel: NotificationChannel) => {
    const key = `${category}:${channel}`;
    return pendingChanges.get(key);
  };

  // Get effective value (pending change or saved)
  const getEffectiveEnabled = (category: NotificationCategory, channel: NotificationChannel) => {
    const pending = getPendingChange(category, channel);
    if (pending?.enabled !== undefined) return pending.enabled;
    return getPreference(category, channel).enabled;
  };

  const getEffectiveFrequency = (category: NotificationCategory, channel: NotificationChannel) => {
    const pending = getPendingChange(category, channel);
    if (pending?.frequency !== undefined) return pending.frequency;
    return getPreference(category, channel).frequency;
  };

  // Handle toggle change
  const handleToggle = (
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean
  ) => {
    if (readOnly || !isChannelImplemented(channel)) return;

    const key = `${category}:${channel}`;
    const current = pendingChanges.get(key) || {};
    setPendingChanges(new Map(pendingChanges).set(key, { ...current, enabled }));
  };

  // Handle frequency change
  const handleFrequencyChange = (
    category: NotificationCategory,
    channel: NotificationChannel,
    frequency: PreferenceFrequency
  ) => {
    if (readOnly || !isChannelImplemented(channel)) return;

    const key = `${category}:${channel}`;
    const current = pendingChanges.get(key) || {};
    setPendingChanges(new Map(pendingChanges).set(key, { ...current, frequency }));
  };

  // Save all changes
  const handleSave = async () => {
    if (pendingChanges.size === 0) return;

    const updates: UpdatePreferencesInput[] = Array.from(pendingChanges.entries()).map(([key, changes]) => {
      const [category, channel] = key.split(':') as [NotificationCategory, NotificationChannel];
      const existing = getPreference(category, channel);
      return {
        resident_id: residentId,
        category,
        channel,
        enabled: changes.enabled ?? existing.enabled,
        frequency: changes.frequency ?? existing.frequency,
      };
    });

    setIsSaving(true);
    try {
      // Save all preferences in parallel
      await Promise.all(updates.map((update) => updatePreference.mutateAsync(update)));
      setPendingChanges(new Map());
      // Don't show toast here - the hook shows it for each update
    } catch {
      // Error toast handled by mutation
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const hasChanges = pendingChanges.size > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Notification Preferences</CardTitle>
          </div>
          {!readOnly && hasChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          )}
        </div>
        <CardDescription>
          Configure how and when to receive notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {CATEGORIES.map((category, idx) => (
          <div key={category}>
            {idx > 0 && <Separator className="mb-6" />}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">
                {NOTIFICATION_CATEGORY_LABELS[category]}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {CHANNELS.map((channel) => {
                  const implemented = isChannelImplemented(channel);
                  const enabled = getEffectiveEnabled(category, channel);
                  const frequency = getEffectiveFrequency(category, channel);
                  const hasPendingChange = !!getPendingChange(category, channel);

                  return (
                    <div
                      key={channel}
                      className={`p-4 rounded-lg border ${
                        implemented
                          ? hasPendingChange
                            ? 'border-primary bg-primary/5'
                            : 'bg-card'
                          : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getChannelIcon(channel)}
                          <span className="font-medium text-sm">
                            {NOTIFICATION_CHANNEL_LABELS[channel]}
                          </span>
                        </div>
                        {!implemented ? (
                          <Badge variant="outline" className="text-xs">
                            Coming soon
                          </Badge>
                        ) : (
                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) =>
                              handleToggle(category, channel, checked)
                            }
                            disabled={readOnly || !implemented}
                          />
                        )}
                      </div>

                      {implemented && enabled && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Delivery
                          </Label>
                          <Select
                            value={frequency}
                            onValueChange={(value) =>
                              handleFrequencyChange(
                                category,
                                channel,
                                value as PreferenceFrequency
                              )
                            }
                            disabled={readOnly}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PREFERENCE_FREQUENCY_LABELS).map(
                                ([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Quiet Hours - future enhancement */}
        <Separator />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Quiet Hours</span>
          </div>
          <Badge variant="outline">Coming soon</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
