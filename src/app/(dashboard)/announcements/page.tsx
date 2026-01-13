'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AnnouncementsTable } from '@/components/announcements';
import { EmergencyContactsCard } from '@/components/announcements/emergency-contacts-card';
import {
  useSendMultiChannelEmergencyBroadcast,
  useEmergencyContactDirectory,
} from '@/hooks/use-announcements';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  Megaphone,
  AlertTriangle,
  Loader2,
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type ChannelKey = 'inApp' | 'email' | 'sms' | 'whatsapp';

interface ChannelConfig {
  key: ChannelKey;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  description: string;
}

export default function AnnouncementsPage() {
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);
  const [emergencyTitle, setEmergencyTitle] = useState('');
  const [emergencyContent, setEmergencyContent] = useState('');
  const [emergencySummary, setEmergencySummary] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [channels, setChannels] = useState({
    inApp: true,
    email: true,
    sms: true,
    whatsapp: false, // Disabled - not yet implemented
  });
  const [showResults, setShowResults] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<{
    results: Array<{ channel: string; success: boolean; count: number; error?: string }>;
    totalRecipients: number;
  } | null>(null);

  const { hasPermission } = useAuth();
  const sendEmergencyBroadcast = useSendMultiChannelEmergencyBroadcast();
  const { data: emergencyContacts } = useEmergencyContactDirectory();

  const canSendEmergency = hasPermission('announcements.emergency_broadcast');

  const channelConfigs: ChannelConfig[] = [
    {
      key: 'inApp',
      label: 'In-App Notification',
      icon: <Bell className="h-4 w-4" />,
      enabled: true,
      description: 'Instant push notification in the Residio app',
    },
    {
      key: 'email',
      label: 'Email',
      icon: <Mail className="h-4 w-4" />,
      enabled: true,
      description: 'Email with emergency details and contacts',
    },
    {
      key: 'sms',
      label: 'SMS',
      icon: <MessageSquare className="h-4 w-4" />,
      enabled: true,
      description: 'Text message to all resident phone numbers',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: <Smartphone className="h-4 w-4" />,
      enabled: false, // Not yet implemented
      description: 'Coming soon - WhatsApp Business API',
    },
  ];

  const handleChannelToggle = (channelKey: ChannelKey) => {
    // Don't allow toggling disabled channels
    const config = channelConfigs.find((c) => c.key === channelKey);
    if (!config?.enabled) return;

    setChannels((prev) => ({
      ...prev,
      [channelKey]: !prev[channelKey],
    }));
  };

  const selectedChannelCount = Object.values(channels).filter(Boolean).length;

  const handleSendEmergency = async () => {
    if (confirmText !== 'SEND') return;
    if (selectedChannelCount === 0) {
      toast.error('Please select at least one notification channel');
      return;
    }

    try {
      const result = await sendEmergencyBroadcast.mutateAsync({
        title: emergencyTitle,
        content: emergencyContent,
        summary: emergencySummary || undefined,
        channels,
      });

      if (result) {
        setBroadcastResults({
          results: result.results,
          totalRecipients: result.totalRecipients,
        });
        setShowResults(true);

        const successChannels = result.results.filter((r) => r.success);
        toast.success(
          `Emergency broadcast sent via ${successChannels.length} channel(s) to ${result.totalRecipients} residents`,
          { duration: 5000 }
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send emergency broadcast');
    }
  };

  const handleCloseDialog = () => {
    setEmergencyDialogOpen(false);
    setEmergencyTitle('');
    setEmergencyContent('');
    setEmergencySummary('');
    setConfirmText('');
    setShowResults(false);
    setBroadcastResults(null);
    setChannels({
      inApp: true,
      email: true,
      sms: true,
      whatsapp: false,
    });
  };

  const isFormValid =
    emergencyTitle.trim().length >= 5 &&
    emergencyContent.trim().length >= 10 &&
    selectedChannelCount > 0;
  const canConfirm = isFormValid && confirmText === 'SEND';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Announcements</h1>
          <p className="text-muted-foreground">
            Create and manage community announcements and communications.
          </p>
        </div>

        {canSendEmergency && (
          <Button
            variant="destructive"
            onClick={() => setEmergencyDialogOpen(true)}
            className="gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Emergency Broadcast
          </Button>
        )}
      </div>

      {/* Emergency Contacts Card */}
      {canSendEmergency && emergencyContacts && emergencyContacts.length > 0 && (
        <EmergencyContactsCard contacts={emergencyContacts} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Community Announcements
          </CardTitle>
          <CardDescription>
            View, create, and manage announcements for the community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnnouncementsTable />
        </CardContent>
      </Card>

      {/* Enhanced Emergency Broadcast Dialog */}
      <Dialog open={emergencyDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Multi-Channel Emergency Broadcast
            </DialogTitle>
            <DialogDescription>
              Send urgent emergency notifications to ALL residents via multiple channels
              simultaneously. Use this only for critical situations.
            </DialogDescription>
          </DialogHeader>

          {showResults && broadcastResults ? (
            // Results View
            <div className="space-y-4 py-4">
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    Emergency Broadcast Sent
                  </span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Reached {broadcastResults.totalRecipients} residents
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Channel Results:</Label>
                <div className="space-y-2">
                  {broadcastResults.results.map((result) => (
                    <div
                      key={result.channel}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="capitalize">
                          {result.channel.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={result.success ? 'default' : 'destructive'}>
                          {result.count} sent
                        </Badge>
                        {result.error && (
                          <span className="text-xs text-muted-foreground">
                            {result.error}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button onClick={handleCloseDialog}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            // Form View
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="emergency-title">Title *</Label>
                <Input
                  id="emergency-title"
                  placeholder="Emergency: Brief description"
                  value={emergencyTitle}
                  onChange={(e) => setEmergencyTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency-summary">
                  Summary <span className="text-muted-foreground">(for SMS)</span>
                </Label>
                <Input
                  id="emergency-summary"
                  placeholder="Brief summary for SMS (optional, max 100 chars)"
                  value={emergencySummary}
                  maxLength={100}
                  onChange={(e) => setEmergencySummary(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {emergencySummary.length}/100 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency-content">Full Message *</Label>
                <Textarea
                  id="emergency-content"
                  placeholder="Provide details about the emergency and any actions residents should take..."
                  value={emergencyContent}
                  onChange={(e) => setEmergencyContent(e.target.value)}
                  rows={5}
                />
              </div>

              <Separator />

              {/* Channel Selection */}
              <div className="space-y-3">
                <Label>Notification Channels</Label>
                <p className="text-xs text-muted-foreground">
                  Select the channels to send the emergency broadcast through.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {channelConfigs.map((channel) => (
                    <div
                      key={channel.key}
                      className={`flex items-start space-x-3 rounded-lg border p-3 ${
                        !channel.enabled
                          ? 'opacity-50 cursor-not-allowed bg-muted/50'
                          : channels[channel.key]
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/30 cursor-pointer'
                      }`}
                      onClick={() => channel.enabled && handleChannelToggle(channel.key)}
                    >
                      <Checkbox
                        id={channel.key}
                        checked={channels[channel.key]}
                        disabled={!channel.enabled}
                        onCheckedChange={() => handleChannelToggle(channel.key)}
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {channel.icon}
                          <label
                            htmlFor={channel.key}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {channel.label}
                          </label>
                          {!channel.enabled && (
                            <Badge variant="secondary" className="text-xs">
                              Coming Soon
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{channel.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedChannelCount} channel(s) selected
                </p>
              </div>

              <Separator />

              {/* Confirmation */}
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">Confirm Emergency Broadcast</p>
                <p className="text-xs text-muted-foreground">
                  Type <strong>SEND</strong> to confirm you want to send this emergency broadcast
                  via {selectedChannelCount} channel(s) to all residents immediately.
                </p>
                <Input
                  placeholder="Type SEND to confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  className="font-mono"
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCloseDialog}
                  disabled={sendEmergencyBroadcast.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleSendEmergency}
                  disabled={!canConfirm || sendEmergencyBroadcast.isPending}
                >
                  {sendEmergencyBroadcast.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending to {selectedChannelCount} channel(s)...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Send Emergency Broadcast
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
