'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
  Plus,
  Zap,
  FilePlus,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useOS } from '@/hooks/use-os';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  type: 'resident' | 'house' | 'payment' | 'security' | 'document' | 'action';
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
  action: Zap,
};

const typeLabels = {
  resident: 'Residents',
  house: 'Properties',
  payment: 'Payments',
  security: 'Security Contacts',
  document: 'Documents',
  action: 'Quick Actions',
};

// Static Quick Actions Definition
const QUICK_ACTIONS: SearchResult[] = [
  {
    id: 'add-resident',
    title: 'Add New Resident',
    subtitle: 'Register a new resident to a property',
    href: '/residents/new',
    type: 'action',
  },
  {
    id: 'create-invoice',
    title: 'Create Invoice',
    subtitle: 'Generate a new invoice for a resident',
    href: '/billing/invoices/new',
    type: 'action',
  },
  {
    id: 'add-house',
    title: 'Add House',
    subtitle: 'Add a new property to the estate',
    href: '/houses/new', // Assumes this route exists or modal trigger
    type: 'action',
  },
  {
    id: 'security-log',
    title: 'View Security Log',
    subtitle: 'Check recent security activity',
    href: '/security/log',
    type: 'action',
  },
];

/**
 * Global Search Command Palette
 *
 * Provides real-time search across multiple modules:
 * - Quick Actions (static)
 * - Residents (by name, phone, email)
 * - Properties (by house number, street, type)
 * - Payments (by reference, amount)
 * - Security Contacts (by name)
 * - Documents (by title)
 *
 * Uses cmdk for keyboard navigation and Modern theme styling.
 * Adapts shortcuts based on OS (Cmd+K vs Ctrl+K).
 */
export function GlobalSearchCommand({ open, onOpenChange }: GlobalSearchCommandProps) {
  const router = useRouter();
  const os = useOS();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    // If empty query, show Quick Actions only? Or show nothing?
    // Let's show nothing initially, or maybe recent searches in future.
    if (!query || query.length < 2) {
      if (query.length === 0) {
        // Show Quick Actions by default when empty
        setResults(QUICK_ACTIONS);
      } else {
        setResults([]);
      }
      return;
    }

    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const searchResults: SearchResult[] = [];

        // 1. Filter Quick Actions locally
        const matchedActions = QUICK_ACTIONS.filter(action =>
          action.title.toLowerCase().includes(query.toLowerCase()) ||
          (action.subtitle && action.subtitle.toLowerCase().includes(query.toLowerCase()))
        );
        searchResults.push(...matchedActions);

        // 2. Search Residents
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

        // 3. Search Houses (by house_number or street name)
        // Run two queries in parallel for more reliable results
        const [housesByNumberResult, streetsResult] = await Promise.all([
          // Query 1: Search by house_number
          supabase
            .from('houses')
            .select('id, house_number, street_id, streets(name)')
            .ilike('house_number', `%${query}%`)
            .limit(5),
          // Query 2: Find streets matching the query
          supabase
            .from('streets')
            .select('id')
            .ilike('name', `%${query}%`)
            .limit(10),
        ]);

        const housesByNumber = housesByNumberResult.data || [];
        const matchingStreetIds = (streetsResult.data || []).map(s => s.id);

        // If we found matching streets, also get houses on those streets
        let housesByStreet: typeof housesByNumber = [];
        if (matchingStreetIds.length > 0) {
          const { data } = await supabase
            .from('houses')
            .select('id, house_number, street_id, streets(name)')
            .in('street_id', matchingStreetIds)
            .limit(5);
          housesByStreet = data || [];
        }

        // Merge and deduplicate results
        const houseMap = new Map<string, (typeof housesByNumber)[number]>();
        [...housesByNumber, ...housesByStreet].forEach(h => {
          if (!houseMap.has(h.id)) houseMap.set(h.id, h);
        });
        const houses = Array.from(houseMap.values()).slice(0, 5);

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

        // 4. Search Payments
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

        // 5. Search Security Contacts
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

        // 6. Search Documents
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
  // Order: Actions first, then others
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

  // Custom order for groups
  const groupOrder = ['action', 'resident', 'house', 'payment', 'security', 'document'];

  // Handle selection
  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery('');
      router.push(href);
    },
    [router, onOpenChange]
  );

  // Close on Escape & Open on Shortcut
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

  const shortcutKey = os === 'mac' ? '⌘' : 'Ctrl';

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search or type a command..."
        value={query}
        onValueChange={setQuery}
        className="border-none focus:ring-0"
      />
      <CommandList className="max-h-[400px]">
        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="py-8 flex flex-col items-center justify-center gap-4"
            >
              {/* Apple-style loading dots */}
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary/60"
                    animate={{
                      scale: [1, 1.3, 1],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
              <motion.span
                className="text-sm text-muted-foreground"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                Searching across workspace...
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        {!isLoading && query.length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found for &quot;{query}&quot;</CommandEmpty>
        )}

        {/* Start Helper State */}
        {!isLoading && query.length < 2 && results.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}

        {/* Render groups in specific order */}
        {groupOrder.map((type) => {
          const items = groupedResults[type];
          if (!items || items.length === 0) return null;

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
          <span className="min-w-[12px] text-center">{shortcutKey}</span>K
        </kbd>
      </div>
    </CommandDialog>
  );
}

