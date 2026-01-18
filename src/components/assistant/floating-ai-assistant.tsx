'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EstateAiAssistant } from '@/components/layout/estate-ai-assistant';
import { cn } from '@/lib/utils';

import { useAiAssistant } from '@/hooks/use-ai-assistant';
import { Sparkles, ArrowRight } from 'lucide-react';

export function FloatingAiAssistant() {
    // Consume context instead of local state
    const {
        isOpen,
        toggleOpen,
        suggestion,
        isSuggestionVisible,
        dismissSuggestion,
        sendMessage
    } = useAiAssistant();

    // We can keep isMinimized local as it's UI state specific to this component's view
    const [isMinimized, setIsMinimized] = useState(false);

    const handleSuggestionClick = () => {
        if (!suggestion) return;

        // If there's an action, perform it
        if (suggestion.action) {
            suggestion.action.onAction();
        } else {
            // Default: open chat and send the suggestion text as context/prompt
            if (!isOpen) toggleOpen();
            // Optional: You might want to just open the chat or send a specific message
            // For now, let's just open the chat.
        }
        dismissSuggestion();
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
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleOpen}>
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

            {/* Bubble Suggestion */}
            <AnimatePresence>
                {isSuggestionVisible && suggestion && !isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 10, x: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                        className="mb-2 mr-2"
                    >
                        <div
                            onClick={handleSuggestionClick}
                            className="cursor-pointer flex items-center gap-3 p-3 bg-background border shadow-lg rounded-xl max-w-xs hover:bg-muted/50 transition-colors"
                        >
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold text-primary">Suggestion</span>
                                <span className="text-sm font-medium leading-tight">{suggestion.text}</span>
                            </div>
                            {suggestion.action && (
                                <Button size="icon" variant="ghost" className="h-6 w-6 ml-1 rounded-full">
                                    <ArrowRight className="h-3 w-3" />
                                </Button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dismissSuggestion();
                                }}
                                className="absolute -top-1 -right-1 h-4 w-4 bg-muted text-muted-foreground rounded-full border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                            >
                                <X className="h-2 w-2" />
                            </button>
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
