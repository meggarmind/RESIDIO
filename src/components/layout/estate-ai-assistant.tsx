'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Plus, Minus, Send, MessageCircle, X } from 'lucide-react';
import { useAiAssistant, Message } from '@/hooks/use-ai-assistant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function EstateAiAssistant() {
    const {
        isOpen,
        toggleOpen,
        isDismissed,
        dismissAssistant,
        messages,
        sendMessage,
        isTyping,
        assistantName,
    } = useAiAssistant();

    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim()) {
            sendMessage(inputValue);
            setInputValue('');
        }
    };

    // Scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [messages, isTyping]);

    if (isDismissed) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="mb-4 w-80 sm:w-96 h-[500px] max-h-[70vh] flex flex-col bg-card border rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="bg-primary p-4 flex items-center justify-between text-primary-foreground">
                            <div className="flex items-center gap-2 font-semibold">
                                <Sparkles className="w-4 h-4" />
                                <span className="truncate max-w-[200px]">{assistantName}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleOpen}
                                    title="Minimize"
                                    className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10"
                                >
                                    <Minus className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={dismissAssistant}
                                    title="Close Assistant"
                                    className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Chat Area */}
                        <ScrollArea ref={scrollRef} className="flex-1 p-4">
                            <div className="space-y-4">
                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "flex flex-col max-w-[80%]",
                                            message.sender === 'user' ? "ml-auto items-end" : "items-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "p-3 rounded-2xl text-sm leading-relaxed",
                                                message.sender === 'user'
                                                    ? "bg-primary text-primary-foreground rounded-tr-none"
                                                    : "bg-muted text-foreground rounded-tl-none border shadow-sm"
                                            )}
                                        >
                                            {message.text}
                                        </div>
                                    </div>
                                ))}
                                {isTyping && (
                                    <div className="flex items-start">
                                        <div className="bg-muted p-3 rounded-2xl rounded-tl-none border shadow-sm flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce" />
                                            <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.2s]" />
                                            <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.4s]" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        {/* Input */}
                        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2 bg-muted/30">
                            <Input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Ask me anything..."
                                className="flex-1 bg-background border-muted"
                            />
                            <Button type="submit" size="icon" disabled={!inputValue.trim()}>
                                <Send className="w-4 h-4" />
                            </Button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Trigger Button */}
            {!isOpen && (
                <motion.div
                    layoutId="assistant-pill"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2"
                >
                    <div
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-full shadow-lg cursor-default border-2 border-primary-foreground/10"
                    >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span className="text-sm font-medium">{assistantName}</span>
                        <div className="w-px h-4 bg-primary-foreground/20 mx-1" />
                        <button
                            onClick={toggleOpen}
                            title="Open Assistant"
                            className="hover:bg-primary-foreground/10 rounded-full p-1 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                        <div className="w-px h-1.5 bg-primary-foreground/20 mx-0.5 rounded-full" />
                        <button
                            onClick={dismissAssistant}
                            title="Hide Assistant"
                            className="hover:bg-primary-foreground/10 rounded-full p-1 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
