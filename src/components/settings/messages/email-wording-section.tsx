'use client';

/**
 * Sections of /settings/wording: edit the text of the resident emails (#907) and Chatmaid WhatsApp messages (#908).
 */

import { useEffect, useState } from 'react';
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
import { getWhatsAppConnectionStatus } from '@/actions/whatsapp/connection';
import { TemplateList } from '@/components/notifications/template-list';
import { TemplateForm } from '@/components/notifications/template-form';
import { useAuth } from '@/lib/auth/auth-provider';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import {
  SAMPLE_VARIABLES,
  getChannelContent,
  isEventKey,
  mergeEventContent,
  renderEventText,
} from '@/lib/notifications/event-content-registry';
import type { NotificationTemplate } from '@/lib/notifications/types';
import { isBridgeProviderName } from '@/lib/whatsapp/bridge-provider';

export function WordingSections() {
  const { hasPermission } = useAuth();
  // The save action checks notifications.manage; hide the control for viewers who cannot use it.
  const canManage = hasPermission('notifications.manage');
  const [whatsappProvider, setWhatsappProvider] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<NotificationTemplate | null>(null);
  const [previewTemplateData, setPreviewTemplateData] = useState<NotificationTemplate | null>(null);

  // Only the bridges (Chatmaid, WAHA) render editable text; for any other provider (or an unreadable status) the tab is read-only.
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
    <>
      <SettingsSection
        id="email"
        title="Email"
        summary="Anything left empty uses the built-in text"
        instant
      >
        <SettingsRow rowId="email-wording" stacked>
          <div className="w-full">
            <TemplateList
              canManage={canManage}
              onEdit={setEditTemplate}
              onPreview={setPreviewTemplateData}
            />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="whatsapp"
        title="WhatsApp"
        summary={isBridgeProviderName(whatsappProvider) ? 'Editable: a self-hosted bridge is the active provider' : 'Read-only: set in code for this provider'}
        defaultCollapsed
        instant
      >
        <SettingsRow rowId="whatsapp-wording" stacked>
          <div className="w-full space-y-3">
            {!isBridgeProviderName(whatsappProvider) && (
              <p className="text-sm text-muted-foreground">
                WhatsApp messages sent through Meta or Twilio use approved templates that are set in
                code, so their wording cannot be edited here. Wording is editable when Chatmaid or WAHA is
                the active provider.
              </p>
            )}
            <TemplateList
              channel="whatsapp"
              whatsappProvider={whatsappProvider}
              canManage={canManage}
              onEdit={setEditTemplate}
              onPreview={setPreviewTemplateData}
            />
          </div>
        </SettingsRow>
      </SettingsSection>

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
    </>
  );
}
