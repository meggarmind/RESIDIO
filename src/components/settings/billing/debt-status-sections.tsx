'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDebtStatusSettings, useUpdateDebtStatusSettings } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { DEBT_STATUSES, DEBT_STATUS_DEFAULTS, type DebtStatus } from '@/lib/billing/debt-status';
import {
  DEBT_STATUS_CHAT_PDF_LIMIT_MAX,
  DEBT_STATUS_CHAT_PDF_LIMIT_MIN,
  DEBT_STATUS_FOOTNOTE_MAX_LENGTH,
  DEBT_STATUS_LABEL_MAX_LENGTH,
  DEBT_STATUS_THRESHOLD_MAX,
  DEBT_STATUS_THRESHOLD_MIN,
} from '@/lib/validators/setting-value';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';

const LABEL_ROW: Record<DebtStatus, string> = {
  arrears: 'debt-label-arrears',
  outstanding: 'debt-label-outstanding',
  paid_in_full: 'debt-label-paid-in-full',
  credit: 'debt-label-credit',
};

function useDebtStatusPage() {
  const { hasPermission } = useAuth();
  const { data, isLoading } = useDebtStatusSettings();
  return {
    // updateDebtStatusSettings enforces the same permission as the route.
    canEdit: hasPermission(PERMISSIONS.SETTINGS_MANAGE_DEBT_STATUS),
    saved: data ?? DEBT_STATUS_DEFAULTS,
    isLoading,
    update: useUpdateDebtStatusSettings(),
  };
}

/** The four status words. The statuses themselves and the counting rule stay in code (#980). */
export function DebtStatusLabelsSection() {
  const { canEdit, saved, isLoading, update } = useDebtStatusPage();
  const [draft, setDraft] = useState<Partial<Record<DebtStatus, string>>>({});
  const labels = Object.fromEntries(DEBT_STATUSES.map((s) => [s, draft[s] ?? saved.labels[s]])) as Record<DebtStatus, string>;
  const isDirty = DEBT_STATUSES.some((s) => labels[s] !== saved.labels[s]);
  const trimmed = DEBT_STATUSES.map((s) => labels[s].trim());
  const valid =
    trimmed.every((l) => l.length > 0 && l.length <= DEBT_STATUS_LABEL_MAX_LENGTH) &&
    new Set(trimmed.map((l) => l.toLowerCase())).size === trimmed.length;

  const save = async () => {
    await update.mutateAsync({ ...saved, labels });
    setDraft({});
  };

  return (
    <SettingsSection
      id="labels"
      title="Status labels"
      summary={isLoading ? 'Loading' : DEBT_STATUSES.map((s) => saved.labels[s]).join(', ')}
      isDirty={isDirty}
      isSaving={update.isPending}
      canSave={valid}
      saveBlockedReason={`Give each status its own label of 1 to ${DEBT_STATUS_LABEL_MAX_LENGTH} characters.`}
      onSave={save}
      onDiscard={() => setDraft({})}
    >
      {isLoading ? (
        <div className="p-4 md:p-5">
          <SettingsSkeleton rows={4} />
        </div>
      ) : (
        DEBT_STATUSES.map((status) => (
          <SettingsRow key={status} rowId={LABEL_ROW[status]}>
            {({ controlId, helpId }) => (
              <Input
                id={controlId}
                aria-describedby={helpId}
                className="w-full md:w-56"
                maxLength={DEBT_STATUS_LABEL_MAX_LENGTH}
                value={labels[status]}
                onChange={(e) => setDraft((d) => ({ ...d, [status]: e.target.value }))}
                disabled={!canEdit}
              />
            )}
          </SettingsRow>
        ))
      )}
    </SettingsSection>
  );
}

/** The arrears threshold, the report footnote and the chat-PDF house limit. */
export function DebtStatusRulesSection() {
  const { canEdit, saved, isLoading, update } = useDebtStatusPage();
  const [threshold, setThreshold] = useState<number>();
  const [footnote, setFootnote] = useState<string>();
  const [limit, setLimit] = useState<number>();
  const [thresholdValid, setThresholdValid] = useState(true);
  const [limitValid, setLimitValid] = useState(true);
  // Remounts the numeric fields on Discard so their typed drafts and messages reset too.
  const [resetKey, setResetKey] = useState(0);

  const next = {
    ...saved,
    arrearsThresholdMonths: threshold ?? saved.arrearsThresholdMonths,
    reportFootnote: footnote ?? saved.reportFootnote,
    chatPdfHouseLimit: limit ?? saved.chatPdfHouseLimit,
  };
  const footnoteValid = next.reportFootnote.trim().length > 0;
  const isDirty =
    next.arrearsThresholdMonths !== saved.arrearsThresholdMonths ||
    next.reportFootnote !== saved.reportFootnote ||
    next.chatPdfHouseLimit !== saved.chatPdfHouseLimit ||
    !thresholdValid ||
    !limitValid;

  const reset = () => {
    setThreshold(undefined);
    setFootnote(undefined);
    setLimit(undefined);
    setThresholdValid(true);
    setLimitValid(true);
    setResetKey((k) => k + 1);
  };

  const save = async () => {
    await update.mutateAsync(next);
    reset();
  };

  return (
    <SettingsSection
      id="rules"
      title="Threshold and report"
      summary={
        isLoading
          ? 'Loading'
          : `${saved.labels.arrears} after ${saved.arrearsThresholdMonths} owed ${saved.arrearsThresholdMonths === 1 ? 'invoice' : 'invoices'}, chat PDF up to ${saved.chatPdfHouseLimit} houses`
      }
      isDirty={isDirty}
      isSaving={update.isPending}
      canSave={thresholdValid && limitValid && footnoteValid}
      saveBlockedReason="Fix the highlighted values, and keep the footnote non-empty."
      onSave={save}
      onDiscard={reset}
    >
      {isLoading ? (
        <div className="p-4 md:p-5">
          <SettingsSkeleton rows={3} />
        </div>
      ) : (
        <>
          <SettingsRow rowId="debt-arrears-threshold">
            {({ controlId }) => (
              <NumericSettingInput
                key={`threshold-${resetKey}`}
                id={controlId}
                min={DEBT_STATUS_THRESHOLD_MIN}
                max={DEBT_STATUS_THRESHOLD_MAX}
                integer
                unit="months"
                value={next.arrearsThresholdMonths}
                onCommit={setThreshold}
                onValidityChange={setThresholdValid}
                disabled={!canEdit}
              />
            )}
          </SettingsRow>
          <SettingsRow rowId="debt-report-footnote">
            {({ controlId, helpId }) => (
              <Textarea
                id={controlId}
                aria-describedby={helpId}
                className="w-full md:w-80"
                maxLength={DEBT_STATUS_FOOTNOTE_MAX_LENGTH}
                value={next.reportFootnote}
                onChange={(e) => setFootnote(e.target.value)}
                disabled={!canEdit}
              />
            )}
          </SettingsRow>
          <SettingsRow rowId="debt-chat-pdf-house-limit">
            {({ controlId }) => (
              <NumericSettingInput
                key={`limit-${resetKey}`}
                id={controlId}
                min={DEBT_STATUS_CHAT_PDF_LIMIT_MIN}
                max={DEBT_STATUS_CHAT_PDF_LIMIT_MAX}
                integer
                unit="houses"
                value={next.chatPdfHouseLimit}
                onCommit={setLimit}
                onValidityChange={setLimitValid}
                disabled={!canEdit}
              />
            )}
          </SettingsRow>
        </>
      )}
    </SettingsSection>
  );
}
