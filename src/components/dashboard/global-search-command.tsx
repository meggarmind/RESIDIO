'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  User,
  Home,
  CreditCard,
  Shield,
  FileText,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  type: 'resident' | 'house' | 'payment' | 'security' | 'document';
}

interface GlobalSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeIcons = {
  resident: User,
  house: Home,
  payment: CreditCard,
  security: Shield,
  document: FileText,
};

const typeLabels = {
  resident: 'Residents',
  house: 'Properties',
  payment: 'Payments',
  security: 'Security Contacts',
  document: 'Documents',
};

/**
 * Global Search Command Palette
 *
 * Provides real-time search across multiple modules:
 * - Residents (by name, phone, email)
 * - Properties (by house number, street, type)
 * - Payments (by reference, amount)
 * - Security Contacts (by name)
 * - Documents (by title)
 *
 * Uses cmdk for keyboard navigation and Modern theme styling.
 */
export function GlobalSearchCommand({ open, onOpenChange }: GlobalSearchCommandProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const searchResults: SearchResult[] = [];

        // Search residents
        const { data: residents } = await supabase
          .from('residents')
          .select('id, first_name, last_name, phone, email')
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        if (residents) {
          searchResults.push(
            ...residents.map((r) => ({
              id: r.id,
              title: `${r.first_name} ${r.last_name}`,
              subtitle: r.phone || r.email || undefined,
              href: `/residents/${r.id}`,
              type: 'resident' as const,
            }))
          );
        }

        // Search houses
        const { data: houses } = await supabase
          .from('houses')
          .select('id, house_number, street_id, streets(name)')
          .or(`house_number.ilike.%${query}%`)
          .limit(5);

        if (houses) {
          searchResults.push(
            ...houses.map((h) => {
              // Handle the joined streets data (could be object or array)
              const streetData = h.streets as { name: string } | { name: string }[] | null;
              const streetName = Array.isArray(streetData)
                ? streetData[0]?.name
                : streetData?.name;

              return {
                id: h.id,
                title: `House ${h.house_number}`,
                subtitle: streetName || undefined,
                href: `/houses/${h.id}`,
                type: 'house' as const,
              };
            })
          );
        }

        // Search payments
        const { data: payments } = await supabase
          .from('payments')
          .select('id, payment_reference, amount')
          .or(`payment_reference.ilike.%${query}%`)
          .limit(5);

        if (payments) {
          searchResults.push(
            ...payments.map((p) => ({
              id: p.id,
              title: p.payment_reference || 'Payment',
              subtitle: `₦${Number(p.amount).toLocaleString()}`,
              href: `/payments/${p.id}`,
              type: 'payment' as const,
            }))
          );
        }

        // Search security contacts
        const { data: contacts } = await supabase
          .from('security_contacts')
          .select('id, name, phone')
          .ilike('name', `%${query}%`)
          .limit(5);

        if (contacts) {
          searchResults.push(
            ...contacts.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: c.phone || undefined,
              href: `/security/contacts/${c.id}`,
              type: 'security' as const,
            }))
          );
        }

        // Search documents
        const { data: documents } = await supabase
          .from('documents')
          .select('id, title, category')
          .ilike('title', `%${query}%`)
          .limit(5);

        if (documents) {
          searchResults.push(
            ...documents.map((d) => ({
              id: d.id,
              title: d.title,
              subtitle: d.category || undefined,
              href: `/documents/${d.id}`,
              type: 'document' as const,
            }))
          );
        }

        setResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeout);
  }, [query]);

  // Group results by type
  const groupedResults = results.reduce<Record<string, SearchResult[]>>(
    (acc, result) => {
      if (!acc[result.type]) {
        acc[result.type] = [];
      }
      acc[result.type].push(result);
      return acc;
    },
    {}
  );

  // Handle selection
  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery('');
      router.push(href);
    },
    [router, onOpenChange]
  );

  // Close on Escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search residents, properties, payments..."
        value={query}
        onValueChange={setQuery}
        className="border-none focus:ring-0"
      />
      <CommandList className="max-h-[400px]">
        {isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Search className="inline-block h-4 w-4 animate-pulse mr-2" />
            Searching...
          </div>
        )}

        {!isLoading && query.length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found for &quot;{query}&quot;</CommandEmpty>
        )}

        {!isLoading && query.length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}

        {Object.entries(groupedResults).map(([type, items]) => {
          const Icon = typeIcons[type as keyof typeof typeIcons];
          const label = typeLabels[type as keyof typeof typeLabels];

          return (
            <CommandGroup key={type} heading={label}>
              {items.map((item) => (
                <CommandItem
                  key={`${type}-${item.id}`}
                  value={`${item.title} ${item.subtitle || ''}`}
                  onSelect={() => handleSelect(item.href)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col flex-1">
                    <span className="font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>

      {/* Keyboard shortcut hint */}
      <div className="border-t px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
        <span>Navigate with ↑↓ arrows, select with Enter</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>
    </CommandDialog>
  );
}
