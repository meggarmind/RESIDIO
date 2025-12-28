'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import {
  Search,
  Home,
  CreditCard,
  Shield,
  FileText,
  User,
} from 'lucide-react';

interface SearchItem {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  keywords: string[];
}

const searchItems: SearchItem[] = [
  {
    href: '/portal',
    label: 'Home',
    description: 'Dashboard overview',
    icon: Home,
    keywords: ['home', 'dashboard', 'overview', 'main'],
  },
  {
    href: '/portal/invoices',
    label: 'Invoices & Payments',
    description: 'View bills and payment history',
    icon: CreditCard,
    keywords: ['invoice', 'payment', 'bill', 'pay', 'money', 'balance', 'dues'],
  },
  {
    href: '/portal/security-contacts',
    label: 'Security Contacts',
    description: 'Manage authorized contacts',
    icon: Shield,
    keywords: ['security', 'contact', 'guard', 'gate', 'visitor', 'access'],
  },
  {
    href: '/portal/documents',
    label: 'Documents',
    description: 'Estate documents and forms',
    icon: FileText,
    keywords: ['document', 'file', 'form', 'policy', 'bylaw', 'notice'],
  },
  {
    href: '/portal/profile',
    label: 'My Profile',
    description: 'View your properties and details',
    icon: User,
    keywords: ['profile', 'property', 'house', 'account', 'settings'],
  },
];

interface PortalSearchProps {
  variant?: 'button' | 'input';
  className?: string;
}

export function PortalSearch({ variant = 'button', className }: PortalSearchProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  // Keyboard shortcut to open search
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {variant === 'button' ? (
        <Button
          variant="outline"
          className={`relative h-9 w-full justify-start text-sm text-muted-foreground ${className}`}
          onClick={() => setOpen(true)}
        >
          <Search className="mr-2 h-4 w-4" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${className}`}
          onClick={() => setOpen(true)}
        >
          <Search className="h-4 w-4" />
          <span className="sr-only">Search</span>
        </Button>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search portal..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {searchItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.keywords.join(' ')}`}
                  onSelect={() => handleSelect(item.href)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
