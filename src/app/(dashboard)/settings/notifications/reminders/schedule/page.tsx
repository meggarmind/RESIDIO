'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  getReminderSettings,
  addReminderStep,
  updateReminderStep,
  removeReminderStep,
  toggleReminderStep,
  resetToDefaultSchedule,
} from '@/actions/notifications/reminder-config';
import type { ReminderScheduleConfig, ReminderScheduleStep, NotificationChannel } from '@/lib/notifications/types';
import { REMINDER_ESCALATION_LABELS, NOTIFICATION_CHANNEL_LABELS, isChannelImplemented, formatDaysFromDue } from '@/lib/notifications/types';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsEmptyState, SettingsSkeleton } from '@/components/settings/settings-states';

function getEscalationBadgeVariant(level: string): 'default' | 'secondary' | 'destructive' {
  switch (level) {
    case 'urgent': case 'final': case 'overdue': return 'destructive';
    case 'warning': return 'default';
    default: return 'secondary';
  }
}

export default function ReminderSchedulePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const [schedule, setSchedule] = useState<ReminderScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingStep, setEditingStep] = useState<ReminderScheduleStep | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newStep, setNewStep] = useState({
    daysFromDue: -7,
    escalationLevel: 'friendly' as ReminderScheduleStep['escalationLevel'],
    channels: ['email'] as NotificationChannel[],
    priority: 5,
  });
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await getReminderSettings();
      setSchedule(settings.schedule);
    } catch {
      toast.error('Failed to load reminder settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleToggleStep = async (stepId: string) => {
    try {
      await toggleReminderStep(stepId);
      await loadSettings();
      toast.success('Step toggled');
    } catch {
      toast.error('Failed to toggle step');
    }
  };

  const handleAddStep = async () => {
    try {
      const result = await addReminderStep({
        ...newStep,
        isActive: true,
      });
      if (result.success) {
        await loadSettings();
        setShowAddDialog(false);
        setNewStep({ daysFromDue: -7, escalationLevel: 'friendly', channels: ['email'], priority: 5 });
        toast.success('Step added');
      } else {
        toast.error(result.error || 'Failed to add step');
      }
    } catch {
      toast.error('Failed to add step');
    }
  };

  const handleUpdateStep = async () => {
    if (!editingStep) return;
    try {
      const result = await updateReminderStep(editingStep.id, {
        daysFromDue: editingStep.daysFromDue,
        escalationLevel: editingStep.escalationLevel,
        channels: editingStep.channels,
        isActive: editingStep.isActive,
        priority: editingStep.priority,
      });
      if (result.success) {
        await loadSettings();
        setEditingStep(null);
        toast.success('Step updated');
      } else {
        toast.error(result.error || 'Failed to update step');
      }
    } catch {
      toast.error('Failed to update step');
    }
  };

  const handleRemoveStep = async (stepId: string) => {
    try {
      const result = await removeReminderStep(stepId);
      if (result.success) {
        await loadSettings();
        toast.success('Step removed');
      } else {
        toast.error(result.error || 'Failed to remove step');
      }
    } catch {
      toast.error('Failed to remove step');
    }
  };

  const handleResetToDefault = async () => {
    try {
      const result = await resetToDefaultSchedule();
      if (result.success) {
        await loadSettings();
        toast.success('Schedule reset to defaults');
      } else {
        toast.error(result.error || 'Failed to reset');
      }
    } catch {
      toast.error('Failed to reset schedule');
    }
  };

  if (loading) {
    return <SettingsSkeleton rows={4} />;
  }

  const steps = schedule?.steps || [];

  const stepSwitch = (step: ReminderScheduleStep) => (
    <Switch
      checked={step.isActive}
      onCheckedChange={() => handleToggleStep(step.id)}
      disabled={!canManage}
      aria-label={`${formatDaysFromDue(step.daysFromDue)} step active`}
    />
  );

  const stepActions = (step: ReminderScheduleStep) => (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        aria-label={`Edit ${formatDaysFromDue(step.daysFromDue)} step`}
        onClick={() => setEditingStep({ ...step })}
      >
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${formatDaysFromDue(step.daysFromDue)} step`}
        onClick={() => setDeleteStepId(step.id)}
        className="size-11 md:size-8 text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  const channelBadges = (step: ReminderScheduleStep) => (
    <div className="flex flex-wrap gap-1">
      {step.channels.map((ch) => (
        <Badge key={ch} variant="outline" className="text-xs">
          {NOTIFICATION_CHANNEL_LABELS[ch]}
        </Badge>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings/notifications/reminders">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <div>
          <h3 className="text-lg font-medium">Reminder Schedule</h3>
          <p className="text-sm text-muted-foreground">
            Configure when and how reminders are sent for invoice payments.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Escalation Schedule</CardTitle>
              <CardDescription>
                Define reminder steps that escalate as the due date approaches.
              </CardDescription>
            </div>
            {canManage && (
            <div className="flex gap-2">
              <ConfirmAction
                trigger={
                  <Button variant="outline" size="sm" className="min-h-11 md:min-h-8">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Reset to Default
                  </Button>
                }
                title="Reset the reminder schedule?"
                description="Every step below is replaced by the default schedule, including any steps you added or edited. This cannot be undone."
                confirmLabel="Reset schedule"
                destructive
                onConfirm={handleResetToDefault}
              />
              <Button size="sm" className="min-h-11 md:min-h-8" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <SettingsEmptyState
              title="No reminder steps yet"
              description="Each step sends a reminder a set number of days before or after the due date."
              action={canManage && (
                <Button size="sm" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              )}
            />
          ) : (
            <>
            {/* Phone: one card per step instead of a table scrolled inside the card (#788). */}
            <ul className="space-y-3 md:hidden">
              {steps.map((step) => (
                <li key={step.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatDaysFromDue(step.daysFromDue)}</span>
                    <Badge variant={getEscalationBadgeVariant(step.escalationLevel)}>
                      {REMINDER_ESCALATION_LABELS[step.escalationLevel]}
                    </Badge>
                  </div>
                  {channelBadges(step)}
                  <div className="flex items-center justify-between gap-2">
                    {stepSwitch(step)}
                    {canManage && stepActions(step)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timing</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Active</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {steps.map((step) => (
                  <TableRow key={step.id}>
                    <TableCell className="font-medium">
                      {formatDaysFromDue(step.daysFromDue)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getEscalationBadgeVariant(step.escalationLevel)}>
                        {REMINDER_ESCALATION_LABELS[step.escalationLevel]}
                      </Badge>
                    </TableCell>
                    <TableCell>{channelBadges(step)}</TableCell>
                    <TableCell>{stepSwitch(step)}</TableCell>
                    {canManage && <TableCell className="text-right">{stepActions(step)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Step Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Reminder Step</DialogTitle>
            <DialogDescription>
              Add a new escalation step to the reminder schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-step-days">Days from Due Date</Label>
              <Input
                id="new-step-days"
                type="number"
                aria-describedby="new-step-days-help"
                value={newStep.daysFromDue}
                onChange={(e) => setNewStep(prev => ({ ...prev, daysFromDue: parseInt(e.target.value) || 0 }))}
              />
              <p id="new-step-days-help" className="text-xs text-muted-foreground">
                Negative = before due, Positive = after due, 0 = on due date
              </p>
            </div>
            <div className="space-y-2">
              <Label>Escalation Level</Label>
              <Select
                value={newStep.escalationLevel}
                onValueChange={(v) => setNewStep(prev => ({ ...prev, escalationLevel: v as ReminderScheduleStep['escalationLevel'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REMINDER_ESCALATION_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="flex gap-2">
                {(['email', 'sms'] as NotificationChannel[]).filter((c) => isChannelImplemented(c)).map((ch) => (
                  <Button
                    key={ch}
                    type="button"
                    variant={newStep.channels.includes(ch) ? 'default' : 'outline'}
                    aria-pressed={newStep.channels.includes(ch)}
                    className="min-h-11 md:min-h-8"
                    size="sm"
                    onClick={() => {
                      setNewStep(prev => ({
                        ...prev,
                        channels: prev.channels.includes(ch)
                          ? prev.channels.filter(c => c !== ch)
                          : [...prev.channels, ch],
                      }));
                    }}
                  >
                    {NOTIFICATION_CHANNEL_LABELS[ch]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddStep}>Add Step</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Step Dialog */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reminder Step</DialogTitle>
            <DialogDescription>Modify this escalation step.</DialogDescription>
          </DialogHeader>
          {editingStep && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-step-days">Days from Due Date</Label>
                <Input
                  id="edit-step-days"
                  type="number"
                  value={editingStep.daysFromDue}
                  onChange={(e) => setEditingStep(prev => prev ? { ...prev, daysFromDue: parseInt(e.target.value) || 0 } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Escalation Level</Label>
                <Select
                  value={editingStep.escalationLevel}
                  onValueChange={(v) => setEditingStep(prev => prev ? { ...prev, escalationLevel: v as ReminderScheduleStep['escalationLevel'] } : null)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REMINDER_ESCALATION_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channels</Label>
                <div className="flex gap-2">
                  {(['email', 'sms'] as NotificationChannel[]).filter((c) => isChannelImplemented(c)).map((ch) => (
                    <Button
                      key={ch}
                      type="button"
                      variant={editingStep.channels.includes(ch) ? 'default' : 'outline'}
                      aria-pressed={editingStep.channels.includes(ch)}
                      className="min-h-11 md:min-h-8"
                      size="sm"
                      onClick={() => {
                        setEditingStep(prev => prev ? {
                          ...prev,
                          channels: prev.channels.includes(ch)
                            ? prev.channels.filter(c => c !== ch)
                            : [...prev.channels, ch],
                        } : null);
                      }}
                    >
                      {NOTIFICATION_CHANNEL_LABELS[ch]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>Cancel</Button>
            <Button onClick={handleUpdateStep}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteStepId} onOpenChange={(open) => !open && setDeleteStepId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Step?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this reminder step from the schedule. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteStepId) handleRemoveStep(deleteStepId); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
