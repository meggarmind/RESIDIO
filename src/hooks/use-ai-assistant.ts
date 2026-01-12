'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useGeneralSettings } from '@/hooks/use-settings';

export interface Message {
    id: string;
    text: string;
    sender: 'user' | 'assistant';
    timestamp: Date;
}

export function useAiAssistant() {
    const { profile } = useAuth();
    const { data: settings } = useGeneralSettings();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);

    const estateName = settings?.find(s => s.key === 'estate_name')?.value as string || 'Estate';
    const assistantNameSetting = settings?.find(s => s.key === 'assistant_name')?.value as string;
    const assistantName = assistantNameSetting || `${estateName} Assistant`;

    const toggleOpen = useCallback(() => {
        setIsOpen(prev => !prev);
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

    return {
        isOpen,
        toggleOpen,
        messages,
        sendMessage,
        isTyping,
        assistantName,
        estateName,
    };
}
