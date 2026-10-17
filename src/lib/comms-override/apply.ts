import { createElement, Fragment, type ReactNode } from 'react';
import { emailBannerHtml, emailBannerText, prefixSubject } from './labels';

/** The parts of an email the redirect rewrites. Everything else (attachments, ...) is kept. */
export interface RedirectableEmail {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  react?: ReactNode;
}

/**
 * Rewrites an email for delivery to the override address: single `to`, labelled
 * subject, banner at the top of the html / text / react body. cc and bcc are
 * dropped. Attachments and any other field pass through untouched.
 */
export function applyEmailRedirect<T extends RedirectableEmail>(
  params: T,
  redirect: { to: string; original: string },
  envLabel: string
): T {
  const { original } = redirect;
  // cc/bcc are not on the transport type today; strip them defensively so a
  // future caller cannot leak a copy to a real address.
  const { cc: _cc, bcc: _bcc, ...rest } = params as T & { cc?: unknown; bcc?: unknown };
  void _cc;
  void _bcc;

  const next: RedirectableEmail = {
    ...rest,
    to: redirect.to,
    subject: prefixSubject(envLabel, original, params.subject),
  };

  if (params.html !== undefined) next.html = emailBannerHtml(envLabel, original) + params.html;
  if (params.text !== undefined) next.text = `${emailBannerText(envLabel, original)}\n\n${params.text}`;
  if (params.react !== undefined && params.react !== null) {
    next.react = createElement(
      Fragment,
      null,
      createElement(
        'div',
        {
          style: {
            background: '#fff4cc',
            border: '1px solid #e0b100',
            padding: '8px 12px',
            margin: '0 0 12px',
            font: '13px/1.4 Arial, sans-serif',
            color: '#5c4400',
          },
        },
        emailBannerText(envLabel, original)
      ),
      params.react
    );
  }
  return next as T;
}
