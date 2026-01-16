'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EstateAiAssistant } from '@/components/layout/estate-ai-assistant';
import { cn } from '@/lib/utils';

export function FloatingAiAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    const toggleOpen = () => {
        setIsOpen(!isOpen);
        setIsMinimized(false);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            <AnimatePresence>
                {isOpen && !isMinimized && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="w-[380px] h-[600px] rounded-2xl shadow-2xl overflow-hidden border bg-background"
                    >
                        {/* Custom Header for Floating Mode */}
                        <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                            <span className="font-semibold text-sm">Estate Assistant</span>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(true)}>
                                    <Minimize2 className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>

                        <div className="h-[calc(100%-48px)]">
                            <EstateAiAssistant />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Button
                onClick={toggleOpen}
                size="lg"
                className={cn(
                    "rounded-full h-14 w-14 shadow-lg transition-all duration-300",
                    isOpen && !isMinimized ? "bg-red-500 hover:bg-red-600 rotate-90" : "bg-primary hover:bg-primary/90"
                )}
            >
                {isOpen && !isMinimized ? (
                    <X className="h-6 w-6 text-white" />
                ) : (
                    <MessageSquare className="h-6 w-6 text-white" />
                )}
            </Button>
        </div>
    );
}
