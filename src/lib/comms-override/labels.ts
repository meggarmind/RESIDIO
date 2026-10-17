/**
 * Pure label builders for redirected messages. The environment tag and the
 * original recipient are always visible so nobody mistakes a UAT message for a
 * real one.
 */

export function redirectTag(envLabel: string, original: string): string {
  return `[${envLabel} → ${original}]`;
}

export function prefixSubject(envLabel: string, original: string, subject: string): string {
  return `${redirectTag(envLabel, original)} ${subject}`;
}

export function emailBannerText(envLabel: string, original: string): string {
  return `${envLabel} environment: this message was redirected. It was intended for ${original}.`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function emailBannerHtml(envLabel: string, original: string): string {
  return (
    '<div style="background:#fff4cc;border:1px solid #e0b100;padding:8px 12px;margin:0 0 12px;' +
    'font:13px/1.4 Arial,sans-serif;color:#5c4400">' +
    escapeHtml(emailBannerText(envLabel, original)) +
    '</div>'
  );
}

/** SMS and free-form WhatsApp text prefix. */
export function prefixText(envLabel: string, original: string, text: string): string {
  return `${redirectTag(envLabel, original)} ${text}`;
}
