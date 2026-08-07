'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, File, X, Loader2, AlertCircle, Lock, FileText, CheckCircle2 } from 'lucide-react';
import { useBankAccounts } from '@/hooks/use-imports';
import { parseCSVFile } from '@/lib/parsers/csv-parser';
import { parseXLSXFile } from '@/lib/parsers/xlsx-parser';
import { parsePdfStatement } from '@/actions/imports/parse-pdf-statement';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StatementUploadProps {
  onComplete: (data: {
    file: File;
    fileType: 'csv' | 'xlsx' | 'pdf';
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
  const [pdfPassword, setPdfPassword] = useState<string>('');
  const [passwordRequired, setPasswordRequired] = useState(false);

  const isPdfFile = file?.name.toLowerCase().endsWith('.pdf');

  const { data: bankAccountsData, isLoading: isLoadingAccounts } = useBankAccounts();
  const bankAccounts = bankAccountsData?.data || [];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();

      if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls' && extension !== 'pdf') {
        setError('Please upload a CSV, Excel, or PDF file');
        return;
      }

      setFile(selectedFile);
      setError(null);
      setPasswordRequired(false);
      setPdfPassword('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  });

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
    setPdfPassword('');
    setPasswordRequired(false);
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
      } else if (extension === 'pdf') {
        // Parse PDF using server action
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bankAccountId', bankAccountId);
        if (pdfPassword) {
          formData.append('password', pdfPassword);
        }

        const result = await parsePdfStatement(formData);

        if (!result.success) {
          if (result.passwordRequired) {
            setPasswordRequired(true);
          }
          throw new Error(result.error || 'Failed to parse PDF');
        }

        // Show toast if saved password was used
        if (result.usedSavedPassword) {
          toast.success('Using saved PDF password for this account');
        }

        rawData = result.data?.rawData || [];
        headers = result.data?.headers || [];
      }

      if (rawData.length === 0) {
        throw new Error('The file appears to be empty or could not be parsed');
      }

      // Determine file type for wizard flow
      const fileType: 'csv' | 'xlsx' | 'pdf' =
        extension === 'csv' ? 'csv' :
          extension === 'pdf' ? 'pdf' : 'xlsx';

      onComplete({
        file,
        fileType,
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

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="h-5 w-5 text-red-500" />;
    if (ext === 'xlsx' || ext === 'xls') return <File className="h-5 w-5 text-emerald-500" />;
    return <File className="h-5 w-5 text-primary" />;
  };

  return (
    <div className="space-y-6">
      {/* File Dropzone */}
      <div>
        <Label className="text-base font-medium">Statement File</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Upload a bank statement in CSV, Excel, or PDF format
        </p>

        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div
                {...getRootProps()}
                className={cn(
                  'relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300',
                  'hover:shadow-md hover:border-primary/40',
                  isDragActive
                    ? 'border-primary bg-primary/5 shadow-lg scale-[1.01]'
                    : 'border-muted-foreground/20 hover:bg-muted/30'
                )}
              >
                <input {...getInputProps()} />
                <motion.div
                  animate={isDragActive ? { scale: 1.15, rotate: -5 } : { scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <div className={cn(
                    'w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 transition-colors duration-300',
                    isDragActive ? 'bg-primary/15' : 'bg-muted'
                  )}>
                    <Upload className={cn(
                      'h-7 w-7 transition-colors duration-300',
                      isDragActive ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                </motion.div>
                <p className="text-sm font-semibold mb-1">
                  {isDragActive ? 'Drop the file here' : 'Drag & drop or click to upload'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports CSV, Excel, and PDF files (.csv, .xlsx, .xls, .pdf)
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="file-selected"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <div className="border rounded-xl p-4 flex items-center justify-between bg-muted/20 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner">
                    {getFileIcon(file.name)}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* PDF Password Input - Only show if password is required and not using saved password */}
      <AnimatePresence>
        {isPdfFile && passwordRequired && (
          <motion.div
            key="password"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2">
              <Label htmlFor="pdf-password" className="text-base font-medium flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                </div>
                PDF Password
                <span className="text-destructive text-sm">(Required)</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                This PDF is password-protected. Enter the password to continue.
              </p>
              <Input
                id="pdf-password"
                type="password"
                placeholder="Enter PDF password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                className="max-w-md input-tactile"
              />
              <p className="text-xs text-muted-foreground">
                Tip: You can save passwords for each bank account in Settings → Bank Accounts.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          className={cn(
            'btn-hover-lift min-w-[200px] shadow-sm',
            isParsing && 'pointer-events-none'
          )}
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
