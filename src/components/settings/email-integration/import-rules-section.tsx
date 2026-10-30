'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useGmailConnectionStatus, useUpdateSyncCriteria } from '@/hooks/use-gmail-connection';
import { parseRuleList, validateImportRules } from '@/lib/email-imports/import-rules';

/**
 * Which senders and subject words the Gmail fetch searches for (#1349). The rules live on the
 * active connection, so the section shows only while Gmail is connected. Anyone the page admits
 * (email_imports.view) can read them; saving needs email_imports.configure, which
 * updateSyncCriteria enforces.
 */
const READ_ONLY_REASON = 'Only users who can configure Gmail import can change these rules.';

export function ImportRulesSection() {
  const canConfigure = useCan(PERMISSIONS.EMAIL_IMPORTS_CONFIGURE);
  const { data: status, isLoading } = useGmailConnectionStatus();
  const updateRules = useUpdateSyncCriteria();
  const [sendersDraft, setSendersDraft] = useState<string | null>(null);
  const [keywordsDraft, setKeywordsDraft] = useState<string | null>(null);

  if (!isLoading && !status?.connected) return null;

  const storedSenders = (status?.syncCriteria?.senders ?? []).join('\n');
  const storedKeywords = (status?.syncCriteria?.keywords ?? []).join('\n');
  const senders = sendersDraft ?? storedSenders;
  const keywords = keywordsDraft ?? storedKeywords;
  const isDirty = sendersDraft !== null || keywordsDraft !== null;
  const check = validateImportRules({ senders: parseRuleList(senders), keywords: parseRuleList(keywords) });
  const senderCount = status?.syncCriteria?.senders?.length ?? 0;

  const discard = () => {
    setSendersDraft(null);
    setKeywordsDraft(null);
  };

  const save = async () => {
    if (check.error !== null) return false;
    try {
      await updateRules.mutateAsync(check.rules);
      discard();
      return true;
    } catch {
      // The mutation has already toasted the error; the drafts stay so nothing typed is lost.
      return false;
    }
  };

  return (
    <SettingsSection
      id="import-rules"
      title="Import rules"
      summary={isLoading ? 'Loading' : `${senderCount} sender${senderCount === 1 ? '' : 's'}`}
      isDirty={isDirty}
      isSaving={updateRules.isPending}
      canSave={canConfigure && check.error === null}
      saveBlockedReason={canConfigure ? (check.error ?? undefined) : READ_ONLY_REASON}
      onSave={save}
      onDiscard={discard}
    >
      <SettingsRow rowId="gmail-import-senders">
        {({ controlId, helpId }) =>
          isLoading ? (
            <SettingsSkeleton rows={2} />
          ) : (
            <Textarea
              id={controlId}
              aria-describedby={helpId}
              value={senders}
              onChange={(e) => setSendersDraft(e.target.value)}
              placeholder={'firstbanknigeria.com\nestate.mailbox@gmail.com'}
              rows={4}
              disabled={!canConfigure || updateRules.isPending}
            />
          )
        }
      </SettingsRow>
      <SettingsRow rowId="gmail-import-keywords">
        {({ controlId, helpId }) =>
          isLoading ? (
            <SettingsSkeleton rows={2} />
          ) : (
            <Textarea
              id={controlId}
              aria-describedby={helpId}
              value={keywords}
              onChange={(e) => setKeywordsDraft(e.target.value)}
              placeholder={'alert\nstatement'}
              rows={3}
              disabled={!canConfigure || updateRules.isPending}
            />
          )
        }
      </SettingsRow>
      {!canConfigure && (
        <p className="px-4 pb-4 text-sm text-muted-foreground md:px-5">{READ_ONLY_REASON}</p>
      )}
      {isDirty && check.error !== null && canConfigure && (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive md:px-5">{check.error}</p>
      )}
    </SettingsSection>
  );
}
