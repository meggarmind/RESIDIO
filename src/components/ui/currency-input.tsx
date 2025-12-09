'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  formatNumberWithCommas,
  parseFormattedNumber,
  getCursorPosition,
  cleanNumericInput,
} from '@/lib/currency-input-utils';

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value?: number | string;
  onValueChange?: (value: number) => void;
  allowDecimals?: boolean;
  maxDecimals?: number;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      allowDecimals = true,
      maxDecimals = 2,
      placeholder = '0.00',
      onBlur,
      onFocus,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [displayValue, setDisplayValue] = React.useState<string>('');
    const [isFocused, setIsFocused] = React.useState(false);

    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current!);

    // Update display value when prop value changes
    React.useEffect(() => {
      if (value === undefined || value === null || value === '') {
        setDisplayValue('');
        return;
      }

      const numericValue = typeof value === 'number' ? value : parseFormattedNumber(value);

      if (numericValue === 0 && !isFocused) {
        setDisplayValue('');
      } else {
        setDisplayValue(formatNumberWithCommas(numericValue));
      }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const rawValue = input.value;
      const cursorPosition = input.selectionStart || 0;

      // Clean the input
      const cleaned = cleanNumericInput(rawValue, allowDecimals, maxDecimals);

      // Format for display
      const formatted = formatNumberWithCommas(cleaned);

      // Update display value
      setDisplayValue(formatted);

      // Calculate new cursor position
      const newCursorPosition = getCursorPosition(displayValue, formatted, cursorPosition);

      // Set cursor position after React updates
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      });

      // Emit numeric value
      if (onValueChange) {
        const numericValue = parseFormattedNumber(cleaned);
        onValueChange(numericValue);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);

      // Format final value on blur (pad decimals if needed)
      const numericValue = parseFormattedNumber(displayValue);

      if (numericValue === 0) {
        setDisplayValue('');
      } else if (allowDecimals && maxDecimals > 0) {
        // Pad decimal places
        const formatted = numericValue.toFixed(maxDecimals);
        setDisplayValue(formatNumberWithCommas(formatted));
      }

      if (onBlur) {
        onBlur(e);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);

      if (onFocus) {
        onFocus(e);
      }
    };

    return (
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-right',
          className
        )}
        ref={inputRef}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
