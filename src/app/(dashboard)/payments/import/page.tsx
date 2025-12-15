'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Upload, Table, Users, CheckCircle, Loader2 } from 'lucide-react';
import { StatementUpload } from '@/components/imports/statement-upload';
import { ColumnMapper } from '@/components/imports/column-mapper';
import { ImportPreview } from '@/components/imports/import-preview';
import { ImportConfirmation } from '@/components/imports/import-confirmation';
import { ImportResults } from '@/components/imports/import-results';
import type { ParsedRow } from '@/lib/validators/import';
import type { ProcessImportResult } from '@/actions/imports/process-import';

type WizardStep = 'upload' | 'mapping' | 'review' | 'confirm' | 'results';

// UI column mapping for the wizard (dual Withdrawal/Deposit columns for Nigerian bank statements)
interface UIColumnMapping {
  date: string;
  description: string;
  withdrawal: string;  // Maps to debit/outgoing transactions
  deposit: string;     // Maps to credit/incoming transactions
  reference: string | null;
  // Transaction type is auto-detected based on which column has value
}

interface ImportState {
  file: File | null;
  fileType: 'csv' | 'xlsx';
  bankAccountId: string;
  transactionFilter: 'credit' | 'debit' | 'all';
  rawData: Record<string, unknown>[];
  headers: string[];
  columnMapping: UIColumnMapping | null;
  parsedRows: ParsedRow[];
  importId: string | null;
  processResult: ProcessImportResult | null;
}

export default function ImportWizardPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [importState, setImportState] = useState<ImportState>({
    file: null,
    fileType: 'csv',
    bankAccountId: '',
    transactionFilter: 'credit',
    rawData: [],
    headers: [],
    columnMapping: null,
    parsedRows: [],
    importId: null,
    processResult: null,
  });

  const handleUploadComplete = useCallback((data: {
    file: File;
    fileType: 'csv' | 'xlsx';
    bankAccountId: string;
    transactionFilter: 'credit' | 'debit' | 'all';
    rawData: Record<string, unknown>[];
    headers: string[];
  }) => {
    setImportState(prev => ({
      ...prev,
      ...data,
    }));
    setCurrentStep('mapping');
  }, []);

  const handleMappingComplete = useCallback((data: {
    columnMapping: UIColumnMapping;
    parsedRows: ParsedRow[];
  }) => {
    setImportState(prev => ({
      ...prev,
      ...data,
    }));
    setCurrentStep('review');
  }, []);

  const handleReviewComplete = useCallback((importId: string) => {
    setImportState(prev => ({
      ...prev,
      importId,
    }));
    setCurrentStep('confirm');
  }, []);

  const handleProcessComplete = useCallback((result: ProcessImportResult) => {
    setImportState(prev => ({
      ...prev,
      processResult: result,
    }));
    setCurrentStep('results');
  }, []);

  const handleStartOver = useCallback(() => {
    setImportState({
      file: null,
      fileType: 'csv',
      bankAccountId: '',
      transactionFilter: 'credit',
      rawData: [],
      headers: [],
      columnMapping: null,
      parsedRows: [],
      importId: null,
      processResult: null,
    });
    setCurrentStep('upload');
  }, []);

  const goBack = useCallback(() => {
    switch (currentStep) {
      case 'mapping':
        setCurrentStep('upload');
        break;
      case 'review':
        setCurrentStep('mapping');
        break;
      case 'confirm':
        setCurrentStep('review');
        break;
      default:
        break;
    }
  }, [currentStep]);

  const getStepNumber = (step: WizardStep): number => {
    switch (step) {
      case 'upload': return 1;
      case 'mapping': return 2;
      case 'review': return 3;
      case 'confirm': return 4;
      case 'results': return 5;
    }
  };

  const isStepComplete = (step: WizardStep): boolean => {
    return getStepNumber(step) < getStepNumber(currentStep);
  };

  const isStepCurrent = (step: WizardStep): boolean => {
    return step === currentStep;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/payments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Import Bank Statement</h1>
          <p className="text-muted-foreground">
            Import payments from a bank statement file
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {(['upload', 'mapping', 'review', 'confirm', 'results'] as WizardStep[]).map((step, index) => (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  isStepComplete(step)
                    ? 'bg-primary border-primary text-primary-foreground'
                    : isStepCurrent(step)
                    ? 'border-primary text-primary'
                    : 'border-muted text-muted-foreground'
                }`}
              >
                {isStepComplete(step) ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={`text-xs mt-1 ${
                  isStepCurrent(step) ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {step === 'upload' && 'Upload'}
                {step === 'mapping' && 'Mapping'}
                {step === 'review' && 'Review'}
                {step === 'confirm' && 'Confirm'}
                {step === 'results' && 'Results'}
              </span>
            </div>
            {index < 4 && (
              <div
                className={`w-16 h-0.5 mx-2 ${
                  isStepComplete(step) ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="max-w-5xl mx-auto">
        {currentStep === 'upload' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Bank Statement
              </CardTitle>
              <CardDescription>
                Upload a CSV or Excel file containing bank transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatementUpload onComplete={handleUploadComplete} />
            </CardContent>
          </>
        )}

        {currentStep === 'mapping' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table className="h-5 w-5" />
                Map Columns
              </CardTitle>
              <CardDescription>
                Verify the column mapping for your bank statement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ColumnMapper
                headers={importState.headers}
                rawData={importState.rawData}
                onComplete={handleMappingComplete}
                onBack={goBack}
              />
            </CardContent>
          </>
        )}

        {currentStep === 'review' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Review Matches
              </CardTitle>
              <CardDescription>
                Review matched residents and manually assign unmatched rows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportPreview
                parsedRows={importState.parsedRows}
                columnMapping={importState.columnMapping!}
                bankAccountId={importState.bankAccountId}
                fileName={importState.file?.name || 'unknown'}
                fileType={importState.fileType}
                onComplete={handleReviewComplete}
                onBack={goBack}
              />
            </CardContent>
          </>
        )}

        {currentStep === 'confirm' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Confirm Import
              </CardTitle>
              <CardDescription>
                Review the import summary before processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportConfirmation
                importId={importState.importId!}
                onComplete={handleProcessComplete}
                onBack={goBack}
              />
            </CardContent>
          </>
        )}

        {currentStep === 'results' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Import Results
              </CardTitle>
              <CardDescription>
                Your import has been processed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportResults
                result={importState.processResult!}
                onStartOver={handleStartOver}
              />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
