'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { detectFirstBankColumns, parseFirstBankDate, parseFirstBankAmount, FIRSTBANK_COLUMNS } from '@/lib/parsers/bank-formats';
import type { ParsedRow } from '@/lib/validators/import';

// Local interface for UI column mapping (different from database ColumnMapping)
// Uses dual withdrawal/deposit columns for Nigerian bank statements
interface UIColumnMapping {
  date: string;
  description: string;
  withdrawal: string;  // Maps to debit/outgoing transactions
  deposit: string;     // Maps to credit/incoming transactions
  reference: string | null;
  // Transaction type is auto-detected based on which column has value
}

const NONE_VALUE = '_none';

interface ColumnMapperProps {
  headers: string[];
  rawData: Record<string, unknown>[];
  onComplete: (data: {
    columnMapping: UIColumnMapping;
    parsedRows: ParsedRow[];
  }) => void;
  onBack: () => void;
}

export function ColumnMapper({ headers, rawData, onComplete, onBack }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<UIColumnMapping>({
    date: '',
    description: '',
    withdrawal: '',
    deposit: '',
    reference: null,
  });
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect columns on mount
  useEffect(() => {
    if (rawData.length > 0) {
      const firstRow = rawData[0];
      const detected = detectFirstBankColumns(firstRow);

      if (detected) {
        // Map credit to deposit (incoming) and debit to withdrawal (outgoing)
        setMapping({
          date: detected.date || '',
          description: detected.description || '',
          withdrawal: detected.debit || '', // Debit = Withdrawal (outgoing)
          deposit: detected.credit || '',   // Credit = Deposit (incoming)
          reference: detected.reference || null,
        });
        setDetectedFormat('FirstBank');
      }
    }
  }, [rawData]);

  const updateMapping = (field: keyof UIColumnMapping, value: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: value === NONE_VALUE ? null : value,
    }));
    setError(null);
  };

  // Preview data with current mapping
  const previewData = useMemo(() => {
    return rawData.slice(0, 5).map((row, index) => {
      const dateRaw = mapping.date ? row[mapping.date] : null;
      const descRaw = mapping.description ? row[mapping.description] : null;
      const withdrawalRaw = mapping.withdrawal ? row[mapping.withdrawal] : null;
      const depositRaw = mapping.deposit ? row[mapping.deposit] : null;
      const refRaw = mapping.reference ? row[mapping.reference] : null;

      const withdrawal = withdrawalRaw ? parseFirstBankAmount(String(withdrawalRaw)) : 0;
      const deposit = depositRaw ? parseFirstBankAmount(String(depositRaw)) : 0;

      return {
        rowNum: index + 1,
        date: dateRaw ? parseFirstBankDate(String(dateRaw)) : null,
        description: descRaw ? String(descRaw) : '',
        withdrawal: withdrawal !== null ? Math.abs(withdrawal) : 0,
        deposit: deposit !== null ? Math.abs(deposit) : 0,
        reference: refRaw ? String(refRaw) : null,
      };
    });
  }, [rawData, mapping]);

  // Both withdrawal and deposit columns are required
  const isValidMapping = mapping.date && mapping.description && mapping.withdrawal && mapping.deposit;

  const handleContinue = () => {
    if (!isValidMapping) {
      setError('Please map all required columns (Date, Description, Withdrawal, Deposit)');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Parse all rows with the mapping
      const parsedRows: ParsedRow[] = rawData.map((row, index) => {
        const dateRaw = mapping.date ? row[mapping.date] : null;
        const descRaw = mapping.description ? row[mapping.description] : null;
        const withdrawalRaw = mapping.withdrawal ? row[mapping.withdrawal] : null;
        const depositRaw = mapping.deposit ? row[mapping.deposit] : null;
        const refRaw = mapping.reference ? row[mapping.reference] : null;

        const parsedDate = dateRaw ? parseFirstBankDate(String(dateRaw)) : null;
        const withdrawalAmount = withdrawalRaw ? parseFirstBankAmount(String(withdrawalRaw)) : 0;
        const depositAmount = depositRaw ? parseFirstBankAmount(String(depositRaw)) : 0;

        // Smart transaction type detection based on which column has value
        // When deposit > 0 and withdrawal = 0 → credit (incoming)
        // When withdrawal > 0 and deposit = 0 → debit (outgoing)
        let transactionType: 'credit' | 'debit' = 'credit';
        let amount = 0;

        const absWithdrawal = withdrawalAmount !== null ? Math.abs(withdrawalAmount) : 0;
        const absDeposit = depositAmount !== null ? Math.abs(depositAmount) : 0;

        if (absDeposit > 0 && absWithdrawal === 0) {
          transactionType = 'credit';
          amount = absDeposit;
        } else if (absWithdrawal > 0 && absDeposit === 0) {
          transactionType = 'debit';
          amount = absWithdrawal;
        } else if (absDeposit > 0) {
          // If both have values, prefer deposit (credit)
          transactionType = 'credit';
          amount = absDeposit;
        } else if (absWithdrawal > 0) {
          transactionType = 'debit';
          amount = absWithdrawal;
        }

        return {
          row_number: index + 1,
          raw_data: row,
          transaction_date: parsedDate,
          description: descRaw ? String(descRaw) : '',
          amount: amount,
          reference: refRaw ? String(refRaw) : null,
          transaction_type: transactionType,
        };
      });

      // Filter out rows with invalid data (no amount means no valid transaction)
      const validRows = parsedRows.filter(row =>
        row.transaction_date && row.amount !== null && row.amount > 0 && row.description
      );

      if (validRows.length === 0) {
        throw new Error('No valid rows found after parsing. Please check your column mapping.');
      }

      onComplete({
        columnMapping: mapping,
        parsedRows: validRows,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse rows';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Detection Status */}
      <div className="flex items-center gap-2">
        {detectedFormat ? (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Detected: {detectedFormat} Format
          </Badge>
        ) : (
          <Badge variant="secondary">Custom Format</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {rawData.length} rows found
        </span>
      </div>

      {/* Column Mapping */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="date-col">
            Date Column <span className="text-destructive">*</span>
          </Label>
          <Select value={mapping.date || NONE_VALUE} onValueChange={(v) => updateMapping('date', v)}>
            <SelectTrigger id="date-col">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>-- Select --</SelectItem>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc-col">
            Description Column <span className="text-destructive">*</span>
          </Label>
          <Select value={mapping.description || NONE_VALUE} onValueChange={(v) => updateMapping('description', v)}>
            <SelectTrigger id="desc-col">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>-- Select --</SelectItem>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="withdrawal-col">
            Withdrawal Column <span className="text-destructive">*</span>
          </Label>
          <Select value={mapping.withdrawal || NONE_VALUE} onValueChange={(v) => updateMapping('withdrawal', v)}>
            <SelectTrigger id="withdrawal-col">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>-- Select --</SelectItem>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Outgoing/debit transactions</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deposit-col">
            Deposit Column <span className="text-destructive">*</span>
          </Label>
          <Select value={mapping.deposit || NONE_VALUE} onValueChange={(v) => updateMapping('deposit', v)}>
            <SelectTrigger id="deposit-col">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>-- Select --</SelectItem>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Incoming/credit transactions</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ref-col">Reference Column</Label>
          <Select value={mapping.reference || NONE_VALUE} onValueChange={(v) => updateMapping('reference', v)}>
            <SelectTrigger id="ref-col">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>-- None --</SelectItem>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transaction Type Detection Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Transaction type is auto-detected: When Deposit &gt; 0 and Withdrawal = 0 → Credit (incoming).
          When Withdrawal &gt; 0 and Deposit = 0 → Debit (outgoing).
        </AlertDescription>
      </Alert>

      {/* Preview Table */}
      <div className="space-y-2">
        <Label className="text-base font-medium">Preview (First 5 Rows)</Label>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right text-red-600">Withdrawal</TableHead>
                <TableHead className="text-right text-green-600">Deposit</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.map((row) => (
                <TableRow key={row.rowNum}>
                  <TableCell className="font-mono text-sm">{row.rowNum}</TableCell>
                  <TableCell>
                    {row.date ? (
                      new Date(row.date).toLocaleDateString()
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.description || <span className="text-muted-foreground">--</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    {row.withdrawal > 0 ? (
                      `₦${row.withdrawal.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-600">
                    {row.deposit > 0 ? (
                      `₦${row.deposit.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[100px] truncate">
                    {row.reference || <span className="text-muted-foreground">--</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={!isValidMapping || isProcessing}
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Continue to Review'
          )}
        </Button>
      </div>
    </div>
  );
}
