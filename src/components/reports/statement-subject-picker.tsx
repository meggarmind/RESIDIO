'use client';

import { Home, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useHouses } from '@/hooks/use-houses';
import { useResidentOptions } from '@/hooks/use-residents';

type StatementFor = 'house' | 'resident';

/**
 * Whose Statement of account to make (#1402): one house or one resident. The lists come from the existing
 * house and resident reads (`getHouses`, `getResidentOptions`), so a choice shows only to a user who can
 * load it (houses.view, residents.view). A list the server refuses shows the reason, never an empty list.
 */
export function StatementSubjectPicker({
    statementFor,
    statementId,
    onChange,
}: {
    statementFor: StatementFor;
    statementId: string;
    onChange: (statementFor: StatementFor, statementId: string) => void;
}) {
    const canHouses = useCan(PERMISSIONS.HOUSES_VIEW);
    const canResidents = useCan(PERMISSIONS.RESIDENTS_VIEW);
    // A user who cannot load one list does not get that choice.
    const kind: StatementFor = statementFor === 'resident' ? (canResidents ? 'resident' : 'house') : canHouses ? 'house' : 'resident';

    // getHouses reads every active house when it sorts by house number, then returns `limit` of them.
    // A list the user may not see is not loaded.
    const houses = useHouses({ limit: 1000 }, { enabled: canHouses });
    const residents = useResidentOptions({ enabled: canResidents });

    const houseOptions = (houses.data?.data ?? []).map((h) => ({
        value: h.id,
        label: [h.house_number, h.street?.name].filter(Boolean).join(', '),
        description: h.short_name ?? undefined,
    }));
    const residentOptions = (residents.data?.data ?? []).map((r) => ({
        value: r.id,
        label: [r.first_name, r.last_name].filter(Boolean).join(' '),
        description: r.resident_code,
    }));
    const query = kind === 'house' ? houses : residents;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Statement for</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {!canHouses && !canResidents ? (
                    <p className="text-sm text-muted-foreground">
                        You cannot view houses or residents, so you cannot choose whose statement to make.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Statement for">
                            {canHouses && (
                                <Button type="button" size="sm" variant={kind === 'house' ? 'default' : 'outline'} aria-pressed={kind === 'house'} onClick={() => onChange('house', '')}>
                                    <Home className="mr-2 h-4 w-4" />
                                    A house
                                </Button>
                            )}
                            {canResidents && (
                                <Button type="button" size="sm" variant={kind === 'resident' ? 'default' : 'outline'} aria-pressed={kind === 'resident'} onClick={() => onChange('resident', '')}>
                                    <User className="mr-2 h-4 w-4" />
                                    A resident
                                </Button>
                            )}
                        </div>
                        {(!canHouses || !canResidents) && (
                            <p className="text-xs text-muted-foreground">
                                {canHouses ? 'You cannot view residents, so only a house statement is available.' : 'You cannot view houses, so only a resident statement is available.'}
                            </p>
                        )}
                        <div className="space-y-2">
                            <Label>{kind === 'house' ? 'House' : 'Resident'}</Label>
                            {query.error ? (
                                <p className="text-sm text-destructive">
                                    Could not load {kind === 'house' ? 'houses' : 'residents'}: {query.error.message}
                                </p>
                            ) : (
                                <SearchableSelect
                                    options={kind === 'house' ? houseOptions : residentOptions}
                                    value={statementId || undefined}
                                    onValueChange={(id) => onChange(kind, id)}
                                    disabled={query.isLoading}
                                    placeholder={query.isLoading ? 'Loading...' : kind === 'house' ? 'Choose a house' : 'Choose a resident'}
                                    searchPlaceholder={kind === 'house' ? 'Search house or street...' : 'Search name or code...'}
                                    emptyMessage={kind === 'house' ? 'No house found.' : 'No resident found.'}
                                />
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
