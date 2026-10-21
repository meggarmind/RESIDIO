'use client';

/**
 * Message wording page: edit the text of the resident emails (#907) and Chatmaid WhatsApp messages (#908).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getWhatsAppConnectionStatus } from '@/actions/whatsapp/connection';
import { TemplateList } from '@/components/notifications/template-list';
import { TemplateForm } from '@/components/notifications/template-form';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  SAMPLE_VARIABLES,
  getChannelContent,
  isEventKey,
  mergeEventContent,
  renderEventText,
} from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';

export default function NotificationTemplatesPage() {
  const { hasPermission } = useAuth();
  // The save action checks notifications.manage; hide the control for viewers who cannot use it.
  const canManage = hasPermission('notifications.manage');
  const [whatsappProvider, setWhatsappProvider] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<NotificationTemplate | null>(null);
  const [previewTemplateData, setPreviewTemplateData] = useState<NotificationTemplate | null>(null);

  // Only Chatmaid renders editable text; for any other provider (or an unreadable status) the tab is read-only.
  useEffect(() => {
    getWhatsAppConnectionStatus().then((result) => setWhatsappProvider(result.data?.provider ?? null));
  }, []);

  const previewChannel = previewTemplateData?.channel === 'whatsapp' ? 'whatsapp' : 'email';
  const previewEvent =
    previewTemplateData?.event && isEventKey(previewTemplateData.event)
      ? previewTemplateData.event
      : null;
  const previewFields = previewEvent ? (getChannelContent(previewEvent, previewChannel)?.fields ?? []) : [];
  const previewContent = previewEvent
    ? mergeEventContent(previewEvent, previewTemplateData?.overrides, previewChannel)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to notification settings">
          <Link href="/settings/notifications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h3 className="text-lg font-medium">Email Wording</h3>
          <p className="text-sm text-muted-foreground">
            Edit the wording of the emails residents receive, and of their WhatsApp messages on the WhatsApp tab. Anything left empty uses the built-in text.
          </p>
        </div>
      </div>
      <Separator />

      <Tabs defaultValue="email" className="space-y-4">
        <TabsList>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <TemplateList
            canManage={canManage}
            onEdit={setEditTemplate}
            onPreview={setPreviewTemplateData}
          />
        </TabsContent>
        <TabsContent value="whatsapp" className="space-y-3">
          {whatsappProvider !== 'chatmaid' && (
            <p className="text-sm text-muted-foreground">
              WhatsApp messages sent through Meta or Twilio use approved templates that are set in
              code, so their wording cannot be edited here. Wording is editable when Chatmaid is the
              active provider.
            </p>
          )}
          <TemplateList
            channel="whatsapp"
            whatsappProvider={whatsappProvider}
            canManage={canManage}
            onEdit={setEditTemplate}
            onPreview={setPreviewTemplateData}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Sheet open={!!editTemplate} onOpenChange={() => setEditTemplate(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit {editTemplate?.display_name}</SheetTitle>
            <SheetDescription>
              Change the wording. The layout and the details it shows stay the same.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 px-4 pb-6">
            {editTemplate && canManage && (
              <TemplateForm
                key={editTemplate.id}
                template={editTemplate}
                onSuccess={() => setEditTemplate(null)}
                onCancel={() => setEditTemplate(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplateData} onOpenChange={() => setPreviewTemplateData(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>
              Sample data, showing your saved wording - {previewTemplateData?.display_name}
            </DialogDescription>
          </DialogHeader>
          {previewEvent && previewContent && (
            <div className="space-y-4">
              {previewFields.map((field) => (
                <Card key={field.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {field.group ? `${field.group}: ` : ''}
                      {field.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">
                      {renderEventText(previewContent[field.key], SAMPLE_VARIABLES)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
