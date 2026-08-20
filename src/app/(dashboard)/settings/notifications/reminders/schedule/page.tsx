'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  CheckCircle,
  XCircle,
  Loader2,
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
import { REMINDER_ESCALATION_LABELS, NOTIFICATION_CHANNEL_LABELS } from '@/lib/notifications/types';

function formatDaysFromDue(days: number): string {
  if (days === 0) return 'On due date';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''} before`;
  return `${days} day${days > 1 ? 's' : ''} after`;
}

function getEscalationBadgeVariant(level: string): 'default' | 'secondary' | 'destructive' {
  switch (level) {
    case 'urgent': case 'final': case 'overdue': return 'destructive';
    case 'warning': return 'default';
    default: return 'secondary';
  }
}

export default function ReminderSchedulePage() {
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
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const steps = schedule?.steps || [];

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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Escalation Schedule</CardTitle>
              <CardDescription>
                Define reminder steps that escalate as the due date approaches.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleResetToDefault}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset to Default
              </Button>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No reminder steps configured. Add a step to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timing</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell>
                      <div className="flex gap-1">
                        {step.channels.map((ch) => (
                          <Badge key={ch} variant="outline" className="text-xs">
                            {NOTIFICATION_CHANNEL_LABELS[ch]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={step.isActive}
                        onCheckedChange={() => handleToggleStep(step.id)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingStep({ ...step })}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteStepId(step.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              <Label>Days from Due Date</Label>
              <Input
                type="number"
                value={newStep.daysFromDue}
                onChange={(e) => setNewStep(prev => ({ ...prev, daysFromDue: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground">
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
                {(['email', 'sms'] as NotificationChannel[]).map((ch) => (
                  <Button
                    key={ch}
                    type="button"
                    variant={newStep.channels.includes(ch) ? 'default' : 'outline'}
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
                <Label>Days from Due Date</Label>
                <Input
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
                  {(['email', 'sms'] as NotificationChannel[]).map((ch) => (
                    <Button
                      key={ch}
                      type="button"
                      variant={editingStep.channels.includes(ch) ? 'default' : 'outline'}
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
