import { getRecipientGroupResidentOptions, getRecipientGroups } from '@/actions/groups/recipient-groups';
import { SettingsPageHeader } from '@/components/settings/settings-page-header';
import { GroupsManager } from '@/app/(dashboard)/settings/groups/groups-manager';

export default async function RecipientGroupsPage() {
  const [groupsResult, optionsResult] = await Promise.all([getRecipientGroups(), getRecipientGroupResidentOptions()]);

  return (
    <div className="space-y-6">
      <SettingsPageHeader description="Named lists of residents. Define a group once, then select it wherever the estate sends copies, such as clearance certificate copies." />
      {groupsResult.error ? (
        <p className="text-sm text-destructive">Could not load groups: {groupsResult.error}</p>
      ) : (
        <GroupsManager groups={groupsResult.data || []} residentOptions={optionsResult.data} residentOptionsError={optionsResult.error} />
      )}
    </div>
  );
}
