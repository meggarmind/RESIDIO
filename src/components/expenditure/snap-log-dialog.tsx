'use client';

import { useState, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Receipt, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SnapLogDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSnapLog: (receiptData: any) => void;
}

export function SnapLogDialog({ open, onOpenChange, onSnapLog }: SnapLogDialogProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processReceipt(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processReceipt(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const processReceipt = async (file: File) => {
        setIsScanning(true);

        // Mock OCR delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        setIsScanning(false);
        toast.success("Receipt scanned successfully!");

        onSnapLog({
            amount: '45000',
            expense_date: new Date().toISOString().split('T')[0],
            description: 'Detected: Petrol Station Receipt',
            vendor_id: '',
            status: 'paid',
            // source_type: 'manual' ? or maybe let user decide in form
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Snap & Log Receipt</DialogTitle>
                    <DialogDescription>
                        Upload a receipt image or PDF. Our AI will extract the details for you.
                    </DialogDescription>
                </DialogHeader>

                <div
                    className={cn(
                        "mt-4 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors min-h-[200px] cursor-pointer",
                        dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:bg-muted/50",
                        isScanning && "pointer-events-none opacity-50"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,.pdf"
                        onChange={handleFileSelect}
                    />

                    {isScanning ? (
                        <div className="flex flex-col items-center animate-in fade-in zoom-in">
                            <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                            <h3 className="font-semibold">Analyzing Receipt...</h3>
                            <p className="text-sm text-muted-foreground mt-1">Extracting date, amount, and vendor</p>
                        </div>
                    ) : (
                        <>
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Upload className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="font-semibold text-lg">Click to Upload</h3>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                or drag and drop your receipt here
                            </p>
                            <p className="text-xs text-muted-foreground mt-4">
                                Supports JPG, PNG, PDF up to 10MB
                            </p>
                        </>
                    )}
                </div>

                <DialogFooter className="sm:justify-start">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isScanning}
                    >
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
