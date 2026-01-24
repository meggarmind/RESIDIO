'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
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
  Zap,
  Search,
} from 'lucide-react';

import { useOS } from '@/hooks/use-os';
import { useRecentSearches } from '@/hooks/use-recent-searches';

interface SearchApiResponse {
  residents: Array<{ id: string; first_name: string; last_name: string; phone_primary: string; email: string }>;
  houses: Array<{ id: string; house_number: string; street_name: string | null }>;
  payments: Array<{ id: string; reference_number: string; amount: number }>;
  contacts: Array<{ id: string; full_name: string; phone_primary: string }>;
  documents: Array<{ id: string; title: string; category: string | null }>;
}

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

  // Recent Searches
  const { searches, addSearch, removeSearch, isMounted } = useRecentSearches();

  // Debounce query for API calls
  const [debouncedQuery] = useDebounce(query, 300);

  // Filter Quick Actions locally (immediate feedback)
  const quickActionResults = query.length === 0
    ? QUICK_ACTIONS
    : QUICK_ACTIONS.filter(action =>
      action.title.toLowerCase().includes(query.toLowerCase()) ||
      (action.subtitle && action.subtitle.toLowerCase().includes(query.toLowerCase()))
    );

  // Fetch from Unified Search API with Caching
  const { data: apiResults = [], isLoading: isApiLoading } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];

      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!response.ok) throw new Error('Search API failed');

      const data: SearchApiResponse = await response.json();
      const results: SearchResult[] = [];

      // Process Residents
      if (data.residents) {
        results.push(...data.residents.map(r => ({
          id: r.id,
          title: `${r.first_name} ${r.last_name}`,
          subtitle: r.phone_primary || r.email || undefined,
          href: `/residents/${r.id}`,
          type: 'resident' as const
        })));
      }

      // Process Houses
      if (data.houses) {
        results.push(...data.houses.map(h => ({
          id: h.id,
          title: `House ${h.house_number}`,
          subtitle: h.street_name || undefined,
          href: `/houses/${h.id}`,
          type: 'house' as const
        })));
      }

      // Process Payments
      if (data.payments) {
        results.push(...data.payments.map(p => ({
          id: p.id,
          title: p.reference_number || 'Payment',
          subtitle: `₦${Number(p.amount).toLocaleString()}`,
          href: `/payments/${p.id}`,
          type: 'payment' as const
        })));
      }

      // Process Security Contacts
      if (data.contacts) {
        results.push(...data.contacts.map(c => ({
          id: c.id,
          title: c.full_name,
          subtitle: c.phone_primary || undefined,
          href: `/security/contacts/${c.id}`,
          type: 'security' as const
        })));
      }

      // Process Documents
      if (data.documents) {
        results.push(...data.documents.map(d => ({
          id: d.id,
          title: d.title,
          subtitle: d.category || undefined,
          href: `/documents/${d.id}`,
          type: 'document' as const
        })));
      }

      return results;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000, // 30 seconds cache
    gcTime: 1000 * 60 * 5, // 5 minutes garbage collection
  });

  // Combine results
  const results = useMemo(() => [...quickActionResults, ...apiResults], [quickActionResults, apiResults]);
  const isLoading = isApiLoading && debouncedQuery.length >= 2;

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
      // Find the item to save it to recent (search safely in results)
      const selectedItem = results.find(r => r.href === href);
      console.log('Selected:', href, selectedItem);

      if (selectedItem) {
        addSearch({
          type: selectedItem.type,
          title: selectedItem.title,
          subtitle: selectedItem.subtitle,
          href: selectedItem.href,
        });
      }

      onOpenChange(false);
      setQuery('');
      router.push(href);
    },
    [router, onOpenChange, results, addSearch]
  );

  // Close on Escape & Open on Shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Toggle search
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }

      // Quick select with ⌘1-5
      if (open && (e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (results[index]) {
          handleSelect(results[index].href);
        }
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange, results, handleSelect]);

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

        {/* Recent Searches */}
        {!isLoading && query.length === 0 && isMounted && searches.length > 0 && (
          <CommandGroup heading="Recent Searches">
            {searches.map((item) => {
              const Icon = typeIcons[item.type as keyof typeof typeIcons] || Search;
              return (
                <CommandItem
                  key={`recent-${item.id}`}
                  value={`${item.title} ${item.subtitle || ''}`}
                  onSelect={() => handleSelect(item.href)}
                  className="cursor-pointer group"
                >
                  <div className="flex items-center flex-1">
                    <Icon className="mr-3 h-4 w-4 text-muted-foreground/70" />
                    <div className="flex flex-col flex-1">
                      <span className="font-medium text-muted-foreground group-aria-selected:text-foreground">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="text-xs text-muted-foreground/60 group-aria-selected:text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSearch(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-opacity"
                  >
                    <span className="sr-only">Remove</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <line x1="18" x2="6" y1="6" y2="18" />
                      <line x1="6" x2="18" y1="6" y2="18" />
                    </svg>
                  </button>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Start Helper State */}
        {!isLoading && query.length < 2 && results.length === 0 && searches.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search
          </div>
        )}

        {/* Helper State (when no recent searches) */}
        {!isLoading && query.length < 2 && results.length === 0 && searches.length > 0 && (
          <div className="hidden" /> // Hide helper when showing recents
        )}

        {/* Render groups in specific order */}
        {(() => {
          let globalIndex = 0;
          return groupOrder.map((type) => {
            const items = groupedResults[type];
            if (!items || items.length === 0) return null;

            const Icon = typeIcons[type as keyof typeof typeIcons];
            const label = typeLabels[type as keyof typeof typeLabels];

            return (
              <CommandGroup key={type} heading={label}>
                {items.map((item) => {
                  globalIndex++;
                  const shortcutIndex = globalIndex <= 5 ? globalIndex : null;

                  return (
                    <CommandItem
                      key={`${type}-${item.id}`}
                      value={`${item.title} ${item.subtitle || ''}`}
                      onSelect={() => handleSelect(item.href)}
                      className="cursor-pointer group flex items-center justify-between"
                    >
                      <div className="flex items-center flex-1">
                        <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col flex-1">
                          <span className="font-medium">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-xs text-muted-foreground">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {shortcutIndex && (
                        <div className="flex items-center gap-1 opacity-0 group-aria-selected:opacity-100 transition-opacity">
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                            {shortcutKey}{shortcutIndex}
                          </kbd>
                        </div>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          });
        })()}
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

