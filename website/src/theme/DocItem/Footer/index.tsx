import React, {type ReactNode} from 'react';
import Footer from '@theme-original/DocItem/Footer';
import type FooterType from '@theme/DocItem/Footer';
import type {WrapperProps} from '@docusaurus/types';
import {useDoc} from '@docusaurus/plugin-content-docs/client';

type Props = WrapperProps<typeof FooterType>;

/**
 * Appends the page's verification stamp beneath the default doc footer.
 *
 * The stamp is written by `npm run docs:verify` at the repo root and records
 * which commit of the app this page was last checked against. Pages carrying
 * no stamp render nothing rather than an empty placeholder.
 */

/**
 * `docs:verify` quotes the date so it stays a string, but a hand-edited page
 * may leave it bare, in which case YAML hands us a Date. Accept both.
 */
function toIsoDay(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 10);
  }
  return undefined;
}

function formatDay(isoDay: string): string {
  const parsed = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDay;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function FooterWrapper(props: Props): ReactNode {
  const {frontMatter} = useDoc();

  // Docusaurus types front matter to its own schema; the residio_* stamp keys
  // are custom, so read them through an index signature.
  const stamp = frontMatter as Record<string, unknown>;
  const verifiedAt = toIsoDay(stamp.residio_verified_at);
  const appVersion =
    typeof stamp.residio_app_version === 'string' ? stamp.residio_app_version : undefined;

  return (
    <>
      <Footer {...props} />
      {verifiedAt && (
        <p className="residio-verified">
          Verified against Residio
          {appVersion ? ` v${appVersion}` : ''} · {formatDay(verifiedAt)}
        </p>
      )}
    </>
  );
}
