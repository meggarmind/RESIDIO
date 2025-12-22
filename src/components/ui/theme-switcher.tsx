'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const themes = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

interface ThemeSwitcherProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function ThemeSwitcher({ variant = 'default', className }: ThemeSwitcherProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch by only rendering after mount
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder with same dimensions to avoid layout shift
    return (
      <Button
        variant="ghost"
        size={variant === 'compact' ? 'icon' : 'sm'}
        className={cn(
          variant === 'compact' ? 'h-8 w-8' : 'h-8 w-full justify-start gap-2',
          className
        )}
        disabled
      >
        <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
        {variant !== 'compact' && (
          <span className="h-4 w-12 animate-pulse rounded bg-muted" />
        )}
      </Button>
    );
  }

  const currentTheme = themes.find((t) => t.value === theme) || themes[2]; // Default to system
  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  if (variant === 'compact') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', className)}
          >
            <CurrentIcon className="h-4 w-4" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {themes.map(({ value, label, icon: Icon }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              {theme === value && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8 w-full justify-start gap-2', className)}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="flex-1 text-left text-xs">{currentTheme.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[140px]">
        {themes.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {theme === value && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
