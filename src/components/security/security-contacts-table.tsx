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
import { Input } from '@/components/ui/input';
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
import { SecurityContactStatusBadge, CategoryBadge } from './security-badges';
import { AccessCodeDisplay } from './access-code-display';
import { useSecurityContacts, useSecurityContactCategories } from '@/hooks/use-security';
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
  const [page, setPage] = useState(1);

  const { data: categories } = useSecurityContactCategories();

  const filters: SecurityContactFilters = {
    search: search || undefined,
    status: status === ALL_VALUE ? undefined : (status as SecurityContactStatus),
    category_id: categoryId === ALL_VALUE ? undefined : categoryId,
    resident_id: residentId,
    page,
    limit: 20,
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
              <TableHead>Access Code</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={showResidentColumn ? 7 : 6} className="text-center py-8">
                  Loading contacts...
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showResidentColumn ? 7 : 6} className="text-center py-8">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No security contacts found</p>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => {
                const activeCode = contact.access_codes?.find((c) => c.is_active);
                return (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Link
                        href={`/security/contacts/${contact.id}`}
                        className="font-medium hover:underline"
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
                      <SecurityContactStatusBadge status={contact.status} />
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
                          {contact.status === 'active' && (
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
