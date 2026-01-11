'use client';

/**
 * Invoice Payment Reminders Configuration Page
 *
 * Allows administrators to configure the automated reminder escalation schedule
 * for invoice payments.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  DialogTrigger,
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
  AlertDialogTrigger,
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
  Bell,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  getReminderSettings,
  saveReminderSchedule,
  addReminderStep,
  updateReminderStep,
  removeReminderStep,
  toggleReminderStep,
  resetToDefaultSchedule,
  toggleRemindersEnabled,
} from '@/actions/notifications/reminder-config';
import type {
  ReminderScheduleConfig,
  ReminderScheduleStep,
  NotificationChannel,
  ReminderEscalationLevel,
} from '@/lib/notifications/types';
import {
  REMINDER_ESCALATION_LABELS,
  NOTIFICATION_CHANNEL_LABELS,
} from '@/lib/notifications/types';

export default function InvoiceRemindersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [schedule, setSchedule] = useState<ReminderScheduleConfig | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<ReminderScheduleStep | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // New step form state
  const [newStep, setNewStep] = useState<Partial<ReminderScheduleStep>>({
    daysFromDue: 0,
    escalationLevel: 'friendly',
    channels: ['email'],
    isActive: true,
    priority: 5,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await getReminderSettings();
      setEnabled(settings.enabled);
      setSchedule(settings.schedule);
      setLastRun(settings.lastRun);
    } catch (error) {
      toast.error('Failed to load reminder settings');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async () => {
    try {
      setSaving(true);
      const result = await toggleRemindersEnabled();
      if (result.success) {
        setEnabled(result.enabled!);
        toast.success(`Reminders ${result.enabled ? 'enabled' : 'disabled'}`);
      } else {
        toast.error(result.error || 'Failed to toggle reminders');
      }
    } catch (error) {
      toast.error('Failed to toggle reminders');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStep = async (stepId: string) => {
    try {
      const result = await toggleReminderStep(stepId);
      if (result.success) {
        await loadSettings();
        toast.success('Step updated');
      } else {
        toast.error(result.error || 'Failed to update step');
      }
    } catch (error) {
      toast.error('Failed to update step');
    }
  };

  const handleAddStep = async () => {
    if (!newStep.daysFromDue === undefined) {
      toast.error('Days from due date is required');
      return;
    }

    try {
      setSaving(true);
      const result = await addReminderStep({
        daysFromDue: newStep.daysFromDue!,
        escalationLevel: newStep.escalationLevel as ReminderEscalationLevel,
        channels: newStep.channels as NotificationChannel[],
        isActive: newStep.isActive ?? true,
        priority: newStep.priority ?? 5,
      });

      if (result.success) {
        await loadSettings();
        setShowAddDialog(false);
        setNewStep({
          daysFromDue: 0,
          escalationLevel: 'friendly',
          channels: ['email'],
          isActive: true,
          priority: 5,
        });
        toast.success('Step added');
      } else {
        toast.error(result.error || 'Failed to add step');
      }
    } catch (error) {
      toast.error('Failed to add step');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStep = async () => {
    if (!editingStep) return;

    try {
      setSaving(true);
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
    } catch (error) {
      toast.error('Failed to update step');
    } finally {
      setSaving(false);
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
    } catch (error) {
      toast.error('Failed to remove step');
    }
  };

  const handleResetToDefault = async () => {
    try {
      setSaving(true);
      const result = await resetToDefaultSchedule();
      if (result.success) {
        await loadSettings();
        toast.success('Schedule reset to default');
      } else {
        toast.error(result.error || 'Failed to reset schedule');
      }
    } catch (error) {
      toast.error('Failed to reset schedule');
    } finally {
      setSaving(false);
    }
  };

  const formatDaysFromDue = (days: number): string => {
    if (days === 0) return 'Due Date';
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''} before`;
    return `${days} day${days > 1 ? 's' : ''} after`;
  };

  const getChannelIcon = (channel: NotificationChannel) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'sms':
        return <MessageSquare className="h-4 w-4" />;
      case 'whatsapp':
        return <Phone className="h-4 w-4" />;
    }
  };

  const getEscalationBadgeVariant = (level: ReminderEscalationLevel) => {
    switch (level) {
      case 'friendly':
        return 'secondary';
      case 'warning':
        return 'outline';
      case 'urgent':
        return 'default';
      case 'final':
        return 'destructive';
      case 'overdue':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings/notifications">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h3 className="text-lg font-medium">Invoice Payment Reminders</h3>
            <p className="text-sm text-muted-foreground">
              Configure automated reminder escalation schedule for invoice payments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="enabled-switch" className="text-sm">
            Reminders {enabled ? 'Enabled' : 'Disabled'}
          </Label>
          <Switch
            id="enabled-switch"
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={saving}
          />
        </div>
      </div>

      <Separator />

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Reminder Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              {enabled ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <div>
                <p className="font-medium">System Status</p>
                <p className="text-xs text-muted-foreground">
                  {enabled ? 'Active' : 'Disabled'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Last Run</p>
                <p className="text-xs text-muted-foreground">
                  {lastRun
                    ? new Date(lastRun).toLocaleString('en-NG', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : 'Never'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Active Steps</p>
                <p className="text-xs text-muted-foreground">
                  {schedule?.steps.filter((s) => s.isActive).length || 0} of{' '}
                  {schedule?.steps.length || 0}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Reminder Schedule</CardTitle>
            <CardDescription>
              Configure when reminders are sent relative to invoice due dates
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Schedule?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset the reminder schedule to the default configuration.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetToDefault}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Step
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Reminder Step</DialogTitle>
                  <DialogDescription>
                    Configure when and how to send this reminder
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="days">Days from Due Date</Label>
                    <Input
                      id="days"
                      type="number"
                      value={newStep.daysFromDue}
                      onChange={(e) =>
                        setNewStep({ ...newStep, daysFromDue: parseInt(e.target.value) })
                      }
                      placeholder="e.g., -7 for 7 days before"
                    />
                    <p className="text-xs text-muted-foreground">
                      Negative = before due, Positive = after due, 0 = on due date
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="level">Escalation Level</Label>
                    <Select
                      value={newStep.escalationLevel}
                      onValueChange={(value) =>
                        setNewStep({
                          ...newStep,
                          escalationLevel: value as ReminderEscalationLevel,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(REMINDER_ESCALATION_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Channels</Label>
                    <div className="flex gap-2">
                      {(['email', 'sms'] as NotificationChannel[]).map((channel) => (
                        <Button
                          key={channel}
                          type="button"
                          variant={newStep.channels?.includes(channel) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            const channels = newStep.channels || [];
                            if (channels.includes(channel)) {
                              setNewStep({
                                ...newStep,
                                channels: channels.filter((c) => c !== channel),
                              });
                            } else {
                              setNewStep({
                                ...newStep,
                                channels: [...channels, channel],
                              });
                            }
                          }}
                        >
                          {getChannelIcon(channel)}
                          <span className="ml-1">{NOTIFICATION_CHANNEL_LABELS[channel]}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddStep} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Step
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timing</TableHead>
                <TableHead>Escalation Level</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule?.steps.map((step) => (
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
                      {step.channels.map((channel) => (
                        <Badge key={channel} variant="outline" className="gap-1">
                          {getChannelIcon(channel)}
                          <span className="hidden sm:inline">
                            {NOTIFICATION_CHANNEL_LABELS[channel]}
                          </span>
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingStep(step)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Step?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove this reminder step? This action
                              cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveStep(step.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!schedule?.steps || schedule.steps.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No reminder steps configured. Add a step to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Step Dialog */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reminder Step</DialogTitle>
            <DialogDescription>Modify the reminder step configuration</DialogDescription>
          </DialogHeader>
          {editingStep && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-days">Days from Due Date</Label>
                <Input
                  id="edit-days"
                  type="number"
                  value={editingStep.daysFromDue}
                  onChange={(e) =>
                    setEditingStep({
                      ...editingStep,
                      daysFromDue: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-level">Escalation Level</Label>
                <Select
                  value={editingStep.escalationLevel}
                  onValueChange={(value) =>
                    setEditingStep({
                      ...editingStep,
                      escalationLevel: value as ReminderEscalationLevel,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REMINDER_ESCALATION_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Channels</Label>
                <div className="flex gap-2">
                  {(['email', 'sms'] as NotificationChannel[]).map((channel) => (
                    <Button
                      key={channel}
                      type="button"
                      variant={editingStep.channels.includes(channel) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (editingStep.channels.includes(channel)) {
                          setEditingStep({
                            ...editingStep,
                            channels: editingStep.channels.filter((c) => c !== channel),
                          });
                        } else {
                          setEditingStep({
                            ...editingStep,
                            channels: [...editingStep.channels, channel],
                          });
                        }
                      }}
                    >
                      {getChannelIcon(channel)}
                      <span className="ml-1">{NOTIFICATION_CHANNEL_LABELS[channel]}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStep} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Days from Due:</strong> Negative numbers indicate days before the due
            date, positive numbers indicate days after. For example, -7 means 7 days before
            the due date.
          </p>
          <p>
            <strong>Escalation Levels:</strong> Each level has a different tone in the
            notification message, from friendly reminders to urgent overdue notices.
          </p>
          <p>
            <strong>Channels:</strong> Select which channels to use for each reminder. SMS
            messages are shorter and may incur costs.
          </p>
          <p>
            <strong>Processing:</strong> The system runs daily at 8 AM and checks for
            invoices matching each active step's timing criteria.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
