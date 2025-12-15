'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, File, X, Loader2, AlertCircle } from 'lucide-react';
import { useBankAccounts } from '@/hooks/use-imports';
import { parseCSVFile } from '@/lib/parsers/csv-parser';
import { parseXLSXFile } from '@/lib/parsers/xlsx-parser';
import { toast } from 'sonner';

interface StatementUploadProps {
  onComplete: (data: {
    file: File;
    fileType: 'csv' | 'xlsx';
    bankAccountId: string;
    transactionFilter: 'credit' | 'debit' | 'all';
    rawData: Record<string, unknown>[];
    headers: string[];
  }) => void;
}

export function StatementUpload({ onComplete }: StatementUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [transactionFilter, setTransactionFilter] = useState<'credit' | 'debit' | 'all'>('credit');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: bankAccountsData, isLoading: isLoadingAccounts } = useBankAccounts();
  const bankAccounts = bankAccountsData?.data || [];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();

      if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls') {
        setError('Please upload a CSV or Excel file');
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
  };

  const handleContinue = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    if (!bankAccountId) {
      setError('Please select a bank account');
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let rawData: Record<string, unknown>[] = [];
      let headers: string[] = [];

      if (extension === 'csv') {
        const result = await parseCSVFile(file);
        rawData = result.rawData;
        headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
      } else if (extension === 'xlsx' || extension === 'xls') {
        const result = await parseXLSXFile(file);
        rawData = result.rawData;
        headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
      }

      if (rawData.length === 0) {
        throw new Error('The file appears to be empty or could not be parsed');
      }

      onComplete({
        file,
        fileType: extension === 'csv' ? 'csv' : 'xlsx',
        bankAccountId,
        transactionFilter,
        rawData,
        headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse file';
      setError(message);
      toast.error(message);
    } finally {
      setIsParsing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* File Dropzone */}
      <div>
        <Label className="text-base font-medium">Statement File</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Upload a bank statement in CSV or Excel format
        </p>

        {!file ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop the file here' : 'Drag & drop or click to upload'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports CSV and Excel files (.csv, .xlsx, .xls)
            </p>
          </div>
        ) : (
          <div className="border rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <File className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRemoveFile}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Bank Account Selection */}
      <div className="space-y-2">
        <Label htmlFor="bank-account" className="text-base font-medium">
          Bank Account
        </Label>
        <p className="text-sm text-muted-foreground">
          Select the estate bank account this statement is from
        </p>
        <Select
          value={bankAccountId}
          onValueChange={setBankAccountId}
          disabled={isLoadingAccounts}
        >
          <SelectTrigger id="bank-account" className="w-full max-w-md">
            <SelectValue placeholder="Select bank account" />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.account_name} ({account.account_number}) - {account.bank_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Transaction Filter */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Transaction Type</Label>
        <p className="text-sm text-muted-foreground">
          Choose which transactions to import from the statement
        </p>
        <RadioGroup
          value={transactionFilter}
          onValueChange={(value) => setTransactionFilter(value as 'credit' | 'debit' | 'all')}
          className="flex flex-wrap gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="credit" id="credit" />
            <Label htmlFor="credit" className="font-normal cursor-pointer">
              Credits only (incoming payments)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="debit" id="debit" />
            <Label htmlFor="debit" className="font-normal cursor-pointer">
              Debits only (outgoing payments)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all" className="font-normal cursor-pointer">
              All transactions
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleContinue}
          disabled={!file || !bankAccountId || isParsing}
          size="lg"
        >
          {isParsing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Parsing File...
            </>
          ) : (
            'Continue to Column Mapping'
          )}
        </Button>
      </div>
    </div>
  );
}
