'use client';

import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type NumericRule = { min: number; max: number; integer?: boolean };

function rangeText({ min, max, integer }: NumericRule): string {
  return `Enter a ${integer ? 'whole number' : 'number'} from ${min.toLocaleString()} to ${max.toLocaleString()}.`;
}

/**
 * Validates what the admin typed. Never falls back to a default: an empty, partial or
 * out-of-range entry is an error and nothing is saved (#790).
 */
export function parseNumericSetting(draft: string, rule: NumericRule): { value: number } | { error: string } {
  const message = rangeText(rule);
  let schema = z.number({ error: message }).min(rule.min, message).max(rule.max, message);
  if (rule.integer) schema = schema.int(message);
  const cleaned = draft.replace(/,/g, '').trim();
  const result = schema.safeParse(cleaned === '' ? undefined : Number(cleaned));
  return result.success ? { value: result.data } : { error: result.error.issues[0]?.message ?? message };
}

interface NumericSettingInputProps extends NumericRule {
  id?: string;
  value: number;
  /** Called once per committed change (blur or Enter), only with a valid value that differs. */
  onCommit: (value: number) => void;
  /** Lets a page with a Save button block saving while the field holds an invalid entry. */
  onValidityChange?: (valid: boolean) => void;
  unit?: string;
  unitPosition?: 'prefix' | 'suffix';
  step?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * A numeric setting with a local draft (#790). Typing never writes; the value is validated
 * and committed on blur or Enter, and an invalid entry shows a plain message instead.
 */
export function NumericSettingInput({
  id,
  value,
  onCommit,
  onValidityChange,
  min,
  max,
  integer,
  unit,
  unitPosition = 'suffix',
  step,
  disabled,
  className,
  'aria-label': ariaLabel,
}: NumericSettingInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // A saved or refetched value replaces the draft and clears any message.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(String(value));
    setError(null);
  }

  useEffect(() => {
    onValidityChange?.(error === null);
  }, [error, onValidityChange]);

  const commit = () => {
    const parsed = parseNumericSetting(draft, { min, max, integer });
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.value !== value) onCommit(parsed.value);
  };

  const unitLabel = unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {unitPosition === 'prefix' && unitLabel}
        <Input
          id={id}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className={cn('w-24 text-center', className)}
        />
        {unitPosition === 'suffix' && unitLabel}
      </div>
      {error && (
        <p id={errorId} role="alert" className="max-w-[16rem] text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
