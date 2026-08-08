'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sun, Moon, Cloud, Bell, User } from 'lucide-react';

interface ContextualGreetingProps {
    name: string;
    className?: string;
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

// Mock data for initial implementation - will be connected to real data in Phase 2
const MOCK_ALERTS = [
    { id: '1', type: 'visitor', message: '3 visitors expected today', icon: User },
    { id: '2', type: 'payment', message: '5 invoices pending approval', icon: Bell },
    { id: '3', type: 'info', message: 'Garbage collection scheduled for tomorrow', icon: Cloud },
];

export function ContextualGreeting({ name, className }: ContextualGreetingProps) {
    const [primaryAlert] = useState(() => MOCK_ALERTS[Math.floor(Math.random() * MOCK_ALERTS.length)]);

    const hour = new Date().getHours();
    const timeOfDay: TimeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    const greeting = {
        morning: 'Good morning',
        afternoon: 'Good afternoon',
        evening: 'Good evening',
    }[timeOfDay];

    const Icon = {
        morning: Sun,
        afternoon: Cloud,
        evening: Moon,
    }[timeOfDay];

    const AlertIcon = primaryAlert.icon;

    return (
        <div className={cn('space-y-1', className)}>
            <div className="flex items-center gap-2">
                <Icon className="h-6 w-6 text-amber-500 dark:text-amber-400 animate-pulse-slow" />
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {greeting}, {name}
                </h1>
            </div>

            <div className="flex items-center gap-2 text-base text-gray-500 dark:text-gray-400">
                <AlertIcon className="h-4 w-4" />
                <span className="animate-fade-in">
                    {primaryAlert.message}
                </span>
            </div>
        </div>
    );
}
