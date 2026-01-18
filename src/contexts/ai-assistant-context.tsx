'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useGeneralSettings } from '@/hooks/use-settings';

export interface Message {
    id: string;
    text: string;
    sender: 'user' | 'assistant';
    timestamp: Date;
}

export interface Suggestion {
    text: string;
    action?: {
        label: string;
        onAction: () => void;
    };
}

interface AiAssistantContextType {
    isOpen: boolean;
    toggleOpen: () => void;
    isDismissed: boolean;
    dismissAssistant: () => void;
    restoreAssistant: () => void;
    messages: Message[];
    sendMessage: (text: string) => Promise<void>;
    isTyping: boolean;
    assistantName: string;
    estateName: string;
    suggestion: Suggestion | null;
    isSuggestionVisible: boolean;
    showSuggestion: (text: string, action?: Suggestion['action']) => void;
    dismissSuggestion: () => void;
}

const AiAssistantContext = createContext<AiAssistantContextType | undefined>(undefined);

export function AiAssistantProvider({ children }: { children: React.ReactNode }) {
    const { profile } = useAuth();
    const { data: settings } = useGeneralSettings();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    // Suggestion state
    const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
    const [isSuggestionVisible, setIsSuggestionVisible] = useState(false);

    // Load dismissal state from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const dismissed = localStorage.getItem('ai-assistant-dismissed');
            if (dismissed === 'true') {
                setIsDismissed(true);
            }
        }
    }, []);

    const estateName = settings?.find(s => s.key === 'estate_name')?.value as string || 'Estate';
    const assistantNameSetting = settings?.find(s => s.key === 'assistant_name')?.value as string;
    const assistantName = assistantNameSetting || `${estateName} Assistant`;

    const toggleOpen = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const dismissAssistant = useCallback(() => {
        setIsDismissed(true);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ai-assistant-dismissed', 'true');
        }
    }, []);

    const restoreAssistant = useCallback(() => {
        setIsDismissed(false);
        setIsOpen(true); // Open it when restored so user sees it immediately
        if (typeof window !== 'undefined') {
            localStorage.removeItem('ai-assistant-dismissed');
        }
    }, []);

    const showSuggestion = useCallback((text: string, action?: Suggestion['action']) => {
        if (isDismissed || isOpen) return; // Don't show if disabled or if chat is already open

        setSuggestion({ text, action });
        setIsSuggestionVisible(true);

        // Auto-hide suggestion after 8 seconds if not interacted with
        setTimeout(() => {
            setIsSuggestionVisible(false);
        }, 8000);
    }, [isDismissed, isOpen]);

    const dismissSuggestion = useCallback(() => {
        setIsSuggestionVisible(false);
        // Clear suggestion data after animation finishes
        setTimeout(() => setSuggestion(null), 300);
    }, []);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        const userMessage: Message = {
            id: Math.random().toString(36).substring(7),
            text,
            sender: 'user',
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setIsTyping(true);

        // Simulate AI response delay
        setTimeout(() => {
            const assistantMessage: Message = {
                id: Math.random().toString(36).substring(7),
                text: `I'm a demo assistant for ${estateName}. You said: "${text}". I don't have a real brain yet, but I'm learning!`,
                sender: 'assistant',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);
            setIsTyping(false);
        }, 1500);
    }, [estateName]);

    // Initial greeting
    useEffect(() => {
        if (isOpen && messages.length === 0 && profile) {
            const firstName = profile.full_name.split(' ')[0];
            const greeting: Message = {
                id: 'greeting',
                text: `Hello ${firstName}! I am your ${assistantName}. How can I help you today?`,
                sender: 'assistant',
                timestamp: new Date(),
            };
            setMessages([greeting]);
        }
    }, [isOpen, messages.length, profile, assistantName]);

    return (
        <AiAssistantContext.Provider
            value={{
                isOpen,
                toggleOpen,
                isDismissed,
                dismissAssistant,
                restoreAssistant,
                messages,
                sendMessage,
                isTyping,
                assistantName,
                estateName,
                suggestion,
                isSuggestionVisible,
                showSuggestion,
                dismissSuggestion,
            }}
        >
            {children}
        </AiAssistantContext.Provider>
    );
}

export function useAiAssistant() {
    const context = useContext(AiAssistantContext);
    if (context === undefined) {
        throw new Error('useAiAssistant must be used within an AiAssistantProvider');
    }
    return context;
}
