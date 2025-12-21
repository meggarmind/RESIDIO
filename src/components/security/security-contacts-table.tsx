'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { SecurityContactStatusBadge, CategoryBadge } from './security-badges';
import { AccessCodeDisplay } from './access-code-display';
import { useSecurityContacts, useSecurityContactCategories, useExpiredContactCount } from '@/hooks/use-security';
import { getEffectiveContactStatus, findValidAccessCode } from '@/lib/security/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  Plus,
  Search,
  Eye,
  Pencil,
  MoreHorizontal,
  Key,
  Ban,
  Trash2,
  Clock,
  AlertTriangle,
  EyeOff,
} from 'lucide-react';
import type { SecurityContactFilters } from '@/lib/validators/security-contact';
import type { SecurityContactStatus } from '@/types/database';
import { SECURITY_CONTACT_STATUS_LABELS } from '@/types/database';

const ALL_VALUE = '_all';

interface SecurityContactsTableProps {
  residentId?: string;
  showResidentColumn?: boolean;
}

export function SecurityContactsTable({
  residentId,
  showResidentColumn = true,
}: SecurityContactsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SecurityContactStatus | typeof ALL_VALUE>(ALL_VALUE);
  const [categoryId, setCategoryId] = useState<string>(ALL_VALUE);
  const [expiringFilter, setExpiringFilter] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [page, setPage] = useState(1);

  const { data: categories } = useSecurityContactCategories();
  const { data: expiredCount } = useExpiredContactCount();

  const filters: SecurityContactFilters = {
    search: search || undefined,
    status: status === ALL_VALUE ? undefined : (status as SecurityContactStatus),
    category_id: categoryId === ALL_VALUE ? undefined : categoryId,
    resident_id: residentId,
    expiring_within_days: expiringFilter ? 7 : undefined,
    page,
    limit: 20,
  };

  // Helper to get expiry info for a contact's access codes
  const getExpiryInfo = (accessCodes: { valid_until: string | null; is_active: boolean }[] | undefined) => {
    if (!accessCodes || accessCodes.length === 0) return null;

    // Find the earliest expiring active code
    const activeCodes = accessCodes.filter(c => c.is_active && c.valid_until);
    if (activeCodes.length === 0) return null;

    const earliestExpiry = activeCodes
      .map(c => new Date(c.valid_until!))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const now = new Date();
    const daysUntilExpiry = Math.ceil((earliestExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      date: earliestExpiry,
      daysUntilExpiry,
      isExpired: daysUntilExpiry < 0,
      isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 7,
    };
  };

  const { data, isLoading, error } = useSecurityContacts(filters);
  const contacts = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading contacts: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <Select
            value={status}
            onValueChange={(v) => setStatus(v as SecurityContactStatus | typeof ALL_VALUE)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All Status</SelectItem>
              {Object.entries(SECURITY_CONTACT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Categories</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

          <Link href={residentId ? `/security/contacts/new?resident=${residentId}` : '/security/contacts/new'}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </Link>
        </div>

        {/* Quick Filters */}
        <div className="flex gap-2 flex-wrap">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={expiringFilter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setExpiringFilter(!expiringFilter);
                    setShowExpired(false);
                    setPage(1);
                  }}
                  className={cn(
                    'gap-2',
                    expiringFilter && 'bg-yellow-600 hover:bg-yellow-700'
                  )}
                >
                  <Clock className="h-4 w-4" />
                  Expiring Soon
                  {expiringFilter && (
                    <Badge variant="secondary" className="ml-1 bg-yellow-100 text-yellow-800">
                      7 days
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Show contacts with codes expiring in the next 7 days</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showExpired ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setShowExpired(!showExpired);
                    setExpiringFilter(false);
                    setPage(1);
                  }}
                  className={cn(
                    'gap-2',
                    showExpired && 'bg-red-600 hover:bg-red-700'
                  )}
                >
                  {showExpired ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {showExpired ? 'Showing Expired' : 'Show Expired'}
                  {expiredCount !== undefined && expiredCount > 0 && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'ml-1',
                        showExpired
                          ? 'bg-red-100 text-red-800'
                          : 'bg-red-100 text-red-800 animate-pulse'
                      )}
                    >
                      {expiredCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {showExpired
                    ? 'Click to hide expired contacts'
                    : `Show ${expiredCount || 0} expired contact(s) with no valid access codes`
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Category</TableHead>
              {showResidentColumn && <TableHead>Resident</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Access Code</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20 mt-1" />
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  {showResidentColumn && (
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  )}
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showResidentColumn ? 8 : 7} className="text-center py-8">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No security contacts found</p>
                </TableCell>
              </TableRow>
            ) : (
              contacts
                // Filter: hide expired contacts by default unless showExpired is true
                .filter((contact) => {
                  const effectiveStatus = getEffectiveContactStatus(contact.status, contact.access_codes);
                  if (showExpired) {
                    // When showExpired is active, only show expired contacts
                    return effectiveStatus === 'expired';
                  }
                  // By default, hide expired contacts
                  return effectiveStatus !== 'expired';
                })
                .map((contact) => {
                // Use helper to find valid (non-expired) active code
                const activeCode = findValidAccessCode(contact.access_codes);
                // Compute effective status based on code expiration
                const effectiveStatus = getEffectiveContactStatus(contact.status, contact.access_codes);
                // Get expiry info for row styling
                const expiryInfo = getExpiryInfo(contact.access_codes);

                // Calculate days since expiry for tooltip
                const daysSinceExpiry = expiryInfo?.isExpired
                  ? Math.abs(expiryInfo.daysUntilExpiry)
                  : 0;

                // Determine row background and styling based on expiry status
                const isExpired = effectiveStatus === 'expired';
                const rowClassName = cn(
                  // Background colors
                  isExpired && 'bg-red-50 dark:bg-red-950/20',
                  expiryInfo?.isExpiringSoon && !expiryInfo.isExpired && 'bg-yellow-50 dark:bg-yellow-950/20',
                  // Left border indicator for expired
                  isExpired && 'border-l-4 border-l-red-500',
                  // Reduced opacity for expired rows
                  isExpired && 'opacity-75'
                );

                return (
                  <TableRow key={contact.id} className={rowClassName}>
                    <TableCell>
                      <Link
                        href={`/security/contacts/${contact.id}`}
                        className={cn(
                          'font-medium hover:underline',
                          isExpired && 'line-through text-muted-foreground'
                        )}
                      >
                        {contact.full_name}
                      </Link>
                      {contact.id_number && (
                        <p className="text-xs text-muted-foreground">{contact.id_number}</p>
                      )}
                    </TableCell>
                    <TableCell>{contact.phone_primary}</TableCell>
                    <TableCell>
                      <CategoryBadge name={contact.category?.name || 'Unknown'} />
                    </TableCell>
                    {showResidentColumn && (
                      <TableCell>
                        {contact.resident ? (
                          <Link
                            href={`/residents/${contact.resident.id}`}
                            className="hover:underline"
                          >
                            {contact.resident.first_name} {contact.resident.last_name}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({contact.resident.resident_code})
                            </span>
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <SecurityContactStatusBadge status={effectiveStatus} />
                    </TableCell>
                    <TableCell>
                      {expiryInfo ? (
                        <div className="flex items-center gap-1">
                          {expiryInfo.isExpired ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="destructive"
                                    className={cn(
                                      'gap-1',
                                      daysSinceExpiry <= 7 && 'animate-pulse'
                                    )}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {daysSinceExpiry}d ago
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Expired on {expiryInfo.date.toLocaleDateString()}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {daysSinceExpiry} day(s) ago
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : expiryInfo.isExpiringSoon ? (
                            <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700">
                              <Clock className="h-3 w-3" />
                              {expiryInfo.daysUntilExpiry}d
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {expiryInfo.date.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No expiry</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {activeCode ? (
                        <AccessCodeDisplay
                          code={activeCode.code}
                          size="sm"
                          showCopy
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">No active code</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/security/contacts/${contact.id}`)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/security/contacts/${contact.id}/edit`)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/security/contacts/${contact.id}?action=generate-code`)
                            }
                          >
                            <Key className="mr-2 h-4 w-4" />
                            Generate Code
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {effectiveStatus === 'active' && (
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/security/contacts/${contact.id}?action=suspend`)
                              }
                              className="text-yellow-600"
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              Suspend
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/security/contacts/${contact.id}?action=revoke`)
                            }
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {contacts.length} of {totalCount} contacts
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
