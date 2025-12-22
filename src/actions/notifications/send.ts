'use server';

/**
 * Server Actions for Sending Notifications
 *
 * Queue and send notifications to residents.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import {
  sendImmediate,
  renderTemplate,
  shouldSendToResident,
  addToQueue,
  PRIORITY,
} from '@/lib/notifications';
import { getTemplate, getTemplateByName } from './templates';
import type {
  NotificationCategory,
  NotificationChannel,
  SendNotificationResult,
} from '@/lib/notifications/types';

/**
 * Send a notification immediately using a template
 */
export async function sendTemplateNotification(params: {
  templateId?: string;
  templateName?: string;
  recipientId: string;
  variables: Record<string, unknown>;
}): Promise<SendNotificationResult & { error?: string }> {
  const { templateId, templateName, recipientId, variables } = params;

  // Get template
  let template;
  if (templateId) {
    const { data, error } = await getTemplate(templateId);
    if (error || !data) {
      return { success: false, error: error || 'Template not found' };
    }
    template = data;
  } else if (templateName) {
    const { data, error } = await getTemplateByName(templateName);
    if (error || !data) {
      return { success: false, error: error || 'Template not found' };
    }
    template = data;
  } else {
    return { success: false, error: 'Either templateId or templateName required' };
  }

  // Check preferences
  const prefCheck = await shouldSendToResident({
    residentId: recipientId,
    category: template.category as NotificationCategory,
    channel: template.channel as NotificationChannel,
  });

  if (!prefCheck.shouldSend) {
    return { success: false, error: prefCheck.reason || 'Blocked by preferences' };
  }

  // Get recipient email
  const supabase = createAdminClient();
  const { data: recipient, error: recipientError } = await supabase
    .from('residents')
    .select('id, email, phone_primary, first_name, last_name')
    .eq('id', recipientId)
    .single();

  if (recipientError || !recipient) {
    return { success: false, error: 'Recipient not found' };
  }

  // Render template
  let rendered;
  try {
    rendered = renderTemplate(template, variables);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to render template',
    };
  }

  // Send immediately
  const result = await sendImmediate({
    recipientId,
    recipientEmail: recipient.email || undefined,
    recipientPhone: recipient.phone_primary,
    channel: template.channel as NotificationChannel,
    subject: rendered.subject || undefined,
    body: rendered.body,
    htmlBody: rendered.html || undefined,
    metadata: { templateId: template.id, templateName: template.name },
  });

  // Audit log
  await logAudit({
    action: result.success ? 'CREATE' : 'REJECT',
    entityType: 'notification_history',
    entityId: result.historyId || 'failed',
    entityDisplay: `${template.display_name} to ${recipient.first_name} ${recipient.last_name}`,
    newValues: {
      templateId: template.id,
      recipientId,
      channel: template.channel,
      success: result.success,
    },
  });

  return result;
}

/**
 * Send a direct notification (no template)
 */
export async function sendDirectNotification(params: {
  recipientId: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  htmlBody?: string;
  category?: NotificationCategory;
}): Promise<SendNotificationResult & { error?: string }> {
  const { recipientId, channel, subject, body, htmlBody, category } = params;

  // Check preferences if category provided
  if (category) {
    const prefCheck = await shouldSendToResident({
      residentId: recipientId,
      category,
      channel,
    });

    if (!prefCheck.shouldSend) {
      return { success: false, error: prefCheck.reason || 'Blocked by preferences' };
    }
  }

  // Get recipient details
  const supabase = createAdminClient();
  const { data: recipient, error: recipientError } = await supabase
    .from('residents')
    .select('id, email, phone_primary, first_name, last_name')
    .eq('id', recipientId)
    .single();

  if (recipientError || !recipient) {
    return { success: false, error: 'Recipient not found' };
  }

  // Send immediately
  const result = await sendImmediate({
    recipientId,
    recipientEmail: recipient.email || undefined,
    recipientPhone: recipient.phone_primary,
    channel,
    subject,
    body,
    htmlBody,
    metadata: { direct: true, category },
  });

  // Audit log
  await logAudit({
    action: result.success ? 'CREATE' : 'REJECT',
    entityType: 'notification_history',
    entityId: result.historyId || 'failed',
    entityDisplay: `Direct ${channel} to ${recipient.first_name} ${recipient.last_name}`,
    newValues: {
      recipientId,
      channel,
      subject,
      success: result.success,
    },
  });

  return result;
}

/**
 * Send notification to multiple recipients
 */
export async function sendBulkNotification(params: {
  templateId: string;
  recipientIds: string[];
  variables: Record<string, unknown>;
  immediate?: boolean;
  priority?: number;
}): Promise<{
  success: boolean;
  sent: number;
  queued: number;
  failed: number;
  errors: string[];
}> {
  const { templateId, recipientIds, variables, immediate = false, priority = PRIORITY.NORMAL } = params;

  // Get template
  const { data: template, error: templateError } = await getTemplate(templateId);
  if (templateError || !template) {
    return {
      success: false,
      sent: 0,
      queued: 0,
      failed: recipientIds.length,
      errors: [templateError || 'Template not found'],
    };
  }

  const results = {
    success: true,
    sent: 0,
    queued: 0,
    failed: 0,
    errors: [] as string[],
  };

  // Get all recipients
  const supabase = createAdminClient();
  const { data: recipients, error: recipientsError } = await supabase
    .from('residents')
    .select('id, email, phone_primary, first_name, last_name')
    .in('id', recipientIds);

  if (recipientsError || !recipients) {
    return {
      success: false,
      sent: 0,
      queued: 0,
      failed: recipientIds.length,
      errors: ['Failed to fetch recipients'],
    };
  }

  // Process each recipient
  for (const recipient of recipients) {
    // Check preferences
    const prefCheck = await shouldSendToResident({
      residentId: recipient.id,
      category: template.category as NotificationCategory,
      channel: template.channel as NotificationChannel,
    });

    if (!prefCheck.shouldSend) {
      results.failed++;
      results.errors.push(`${recipient.id}: ${prefCheck.reason || 'Blocked by preferences'}`);
      continue;
    }

    // Merge recipient-specific variables
    const recipientVariables = {
      ...variables,
      resident_name: `${recipient.first_name} ${recipient.last_name}`,
      email: recipient.email,
    };

    // Render template
    let rendered;
    try {
      rendered = renderTemplate(template, recipientVariables);
    } catch (error) {
      results.failed++;
      results.errors.push(
        `${recipient.id}: ${error instanceof Error ? error.message : 'Render failed'}`
      );
      continue;
    }

    if (immediate) {
      // Send immediately
      const sendResult = await sendImmediate({
        recipientId: recipient.id,
        recipientEmail: recipient.email || undefined,
        recipientPhone: recipient.phone_primary,
        channel: template.channel as NotificationChannel,
        subject: rendered.subject || undefined,
        body: rendered.body,
        htmlBody: rendered.html || undefined,
        metadata: { templateId: template.id, bulk: true },
      });

      if (sendResult.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push(`${recipient.id}: ${sendResult.error || 'Send failed'}`);
      }
    } else {
      // Queue for later
      const queueResult = await addToQueue({
        template_id: templateId,
        recipient_id: recipient.id,
        channel: template.channel as NotificationChannel,
        subject: rendered.subject || undefined,
        body: rendered.body,
        html_body: rendered.html || undefined,
        variables: recipientVariables,
        priority,
        metadata: { bulk: true },
      });

      if (queueResult.success) {
        results.queued++;
      } else {
        results.failed++;
        results.errors.push(`${recipient.id}: ${queueResult.error || 'Queue failed'}`);
      }
    }
  }

  results.success = results.failed === 0;

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'notification_history',
    entityId: 'bulk',
    entityDisplay: `Bulk ${template.display_name}`,
    newValues: {
      templateId,
      recipients: recipientIds.length,
      sent: results.sent,
      queued: results.queued,
      failed: results.failed,
    },
  });

  return results;
}

/**
 * Send welcome notification to a new resident
 */
export async function sendWelcomeNotification(
  residentId: string
): Promise<SendNotificationResult & { error?: string }> {
  // Get resident details
  const supabase = createAdminClient();
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('*')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  // Get estate settings
  const { data: estateSettings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'estate_name')
    .single();

  const estateName = (estateSettings?.value as string) || 'Residio Estate';

  // Send using welcome template
  return sendTemplateNotification({
    templateName: 'welcome_resident',
    recipientId: residentId,
    variables: {
      resident_name: `${resident.first_name} ${resident.last_name}`,
      estate_name: estateName,
      resident_code: resident.resident_code,
      email: resident.email,
    },
  });
}

/**
 * Send invoice notification
 */
export async function sendInvoiceNotification(
  invoiceId: string
): Promise<SendNotificationResult & { error?: string }> {
  const supabase = createAdminClient();

  // Get invoice with resident and house details
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      resident:residents(id, first_name, last_name, email, phone_primary),
      house:houses(house_number, street:streets(name))
    `)
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  const houseAddress = invoice.house
    ? `${invoice.house.house_number} ${invoice.house.street?.name || ''}`
    : 'N/A';

  // Send using invoice template
  return sendTemplateNotification({
    templateName: 'invoice_generated',
    recipientId: invoice.resident_id,
    variables: {
      resident_name: `${invoice.resident?.first_name} ${invoice.resident?.last_name}`,
      invoice_number: invoice.invoice_number,
      amount_due: invoice.amount_due,
      house_address: houseAddress,
      due_date: invoice.due_date,
    },
  });
}
