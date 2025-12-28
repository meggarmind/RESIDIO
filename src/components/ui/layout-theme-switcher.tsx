'use client';

import { useLayoutTheme, type LayoutTheme } from '@/contexts/layout-theme-context';
import { Button } from '@/components/ui/button';
import { Monitor, Smartphone, Settings2, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface LayoutThemeSwitcherProps {
  className?: string;
  /** Show labels next to icons in dropdown */
  showLabels?: boolean;
}

const themes: { value: LayoutTheme; label: string; description: string; Icon: typeof Monitor }[] = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Adapts to screen size',
    Icon: Settings2,
  },
  {
    value: 'compact',
    label: 'Compact',
    description: 'Mobile-optimized layout',
    Icon: Smartphone,
  },
  {
    value: 'expanded',
    label: 'Expanded',
    description: 'Desktop-optimized layout',
    Icon: Monitor,
  },
];

export function LayoutThemeSwitcher({ className, showLabels = true }: LayoutThemeSwitcherProps) {
  const { theme, setTheme, effectiveTheme } = useLayoutTheme();

  const currentTheme = themes.find((t) => t.value === theme) ?? themes[0];
  const CurrentIcon = currentTheme.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          title={`Layout: ${currentTheme.label} (${effectiveTheme})`}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="sr-only">Toggle layout theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {themes.map(({ value, label, description, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {showLabels && (
              <div className="flex-1 min-w-0">
                <div className="font-medium">{label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {description}
                </div>
              </div>
            )}
            {theme === value && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
