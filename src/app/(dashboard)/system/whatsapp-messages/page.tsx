import { OutboundSendsList } from '@/app/(dashboard)/system/whatsapp-messages/outbound-sends-list';

// Live system state, so it lives under /system, not /settings (ADR-0004).
export default function WhatsAppMessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">WhatsApp Messages</h3>
        <p className="text-sm text-muted-foreground">
          Watch the WhatsApp messages the app sends. Set an auto-refresh interval, or refresh now.
        </p>
      </div>

      <OutboundSendsList />
    </div>
  );
}
