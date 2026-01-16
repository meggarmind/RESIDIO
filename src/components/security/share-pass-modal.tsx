'use client';

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Mail, MessageCircle, Check } from "lucide-react";
import { useState } from "react";
import { DigitalPassCard } from "./digital-pass-card";
import { toast } from "sonner";

interface SharePassModalProps {
    visitorName?: string;
    accessCode?: string;
    children?: React.ReactNode;
}

export function SharePassModal({
    visitorName = "Guest Visitor",
    accessCode = "829-103",
    children
}: SharePassModalProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(`Here is your Residio access pass: https://residio.app/pass/${accessCode}`);
        setCopied(true);
        toast.success("Pass link copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleWhatsApp = () => {
        window.open(`https://wa.me/?text=Here is your Residio access pass: ${accessCode}`, '_blank');
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                {children || <Button>Share Pass</Button>}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Share Digital Pass</DialogTitle>
                    <DialogDescription>
                        Send this access pass to your visitor. They can use the QR code at the gate.
                    </DialogDescription>
                </DialogHeader>

                {/* Pass Preview */}
                <div className="py-2 scale-90 origin-top">
                    <DigitalPassCard
                        visitorName={visitorName}
                        accessCode={accessCode}
                        location="Main Gate Entrance"
                        validUntil="18:00 PM"
                    />
                </div>

                {/* Share Options */}
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="gap-2" onClick={handleCopy}>
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? "Copied" : "Copy Link"}
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={handleWhatsApp}>
                            <MessageCircle className="h-4 w-4 text-green-600" />
                            WhatsApp
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
