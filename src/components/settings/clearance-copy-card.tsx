'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingEffect } from '@/components/settings/setting-effect';
import { useClearanceCopyOptions } from '@/hooks/use-settings';

const NONE = '__none__';

interface ClearanceCopyCardProps {
    /** The stored group id; blank or unknown means no copies. */
    groupId: string;
    canEdit: boolean;
    pending: boolean;
    onChange: (groupId: string) => void;
}

/** "Clearance certificate copies" on Settings > Billing (#816 decision 23): which group gets a copy of every issued certificate. */
export function ClearanceCopyCard({ groupId, canEdit, pending, onChange }: ClearanceCopyCardProps) {
    const { data: groups, isLoading, error } = useClearanceCopyOptions();
    const selected = groups?.find((group) => group.id === groupId);

    return (
        <div>
            <h3 className="text-lg font-medium">Clearance Certificate Copies</h3>
            <p className="text-sm text-muted-foreground mb-4">
                Every issued clearance certificate is copied on WhatsApp to the members of one group.
            </p>
            <Card>
                <CardContent className="pt-6 space-y-4">
                    {error ? (
                        <Alert variant="destructive">
                            <AlertDescription>Could not load the groups: {error.message}</AlertDescription>
                        </Alert>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="clearance_copy_group">Send copies to</Label>
                                <Select value={selected ? selected.id : NONE} onValueChange={(value) => onChange(value === NONE ? '' : value)} disabled={!canEdit || pending || isLoading}>
                                    <SelectTrigger id="clearance_copy_group" className="w-full sm:w-72">
                                        <SelectValue placeholder="Choose a group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>No copies</SelectItem>
                                        {(groups ?? []).map((group) => (
                                            <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <SettingEffect>certificates issued from now on, whether from a move-out or a WhatsApp request. Certificates already issued are not copied again.</SettingEffect>
                            </div>

                            {selected && (
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Members of {selected.name}</p>
                                    {selected.members.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">This group has no members yet, so no copies will be sent.</p>
                                    ) : (
                                        <ul className="space-y-1 text-sm">
                                            {selected.members.map((member) => (
                                                <li key={member.residentId}>
                                                    {member.name}
                                                    {member.warning && <span className="text-warning">: {member.warning}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <p className="text-sm text-muted-foreground">
                                Members are managed in <Link href="/settings/groups" className="underline">Settings &gt; Groups</Link>. A member with a warning will not receive a copy; it shows in the WhatsApp console with a Retry.
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
