'use client';

import { useSmartSuggestions, SmartSuggestion } from '@/hooks/use-smart-suggestions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, X, ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

function SuggestionItem({
    suggestion,
    onDismiss
}: {
    suggestion: SmartSuggestion;
    onDismiss: (id: string) => void;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative flex flex-col gap-3 rounded-lg border bg-gradient-to-br from-white to-gray-50 p-4 dark:from-slate-900 dark:to-slate-900/50 dark:border-slate-800 shadow-sm"
        >
            <button
                onClick={() => onDismiss(suggestion.id)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
                <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
                <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    suggestion.priority === 'high' ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                        suggestion.priority === 'medium' ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                            "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                )}>
                    <Zap className="h-4 w-4" />
                </div>
                <h4 className="font-medium text-sm">{suggestion.title}</h4>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
                {suggestion.description}
            </p>

            <Button size="sm" variant="outline" className="w-full justify-between group" asChild>
                <Link href={suggestion.actionUrl}>
                    {suggestion.actionLabel}
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </Link>
            </Button>
        </motion.div>
    );
}

export function SmartSuggestions() {
    const { suggestions, dismissSuggestion } = useSmartSuggestions();
    // Local state to track dismissed items for this session demo
    const [visibleSuggestions, setVisibleSuggestions] = useState(suggestions);

    const handleDismiss = (id: string) => {
        dismissSuggestion(id);
        setVisibleSuggestions(prev => prev.filter(s => s.id !== id));
    };

    if (visibleSuggestions.length === 0) return null;

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Suggestions for you
                </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <AnimatePresence mode="popLayout">
                        {visibleSuggestions.map(suggestion => (
                            <SuggestionItem
                                key={suggestion.id}
                                suggestion={suggestion}
                                onDismiss={handleDismiss}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </CardContent>
        </Card>
    );
}
