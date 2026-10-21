'use client';

import { HouseTypesList } from '@/components/admin/house-types-list';
import { StreetsList } from '@/components/admin/streets-list';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { useHouseTypes, useStreets } from '@/hooks/use-reference';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const REFERENCE = [PERMISSIONS.SETTINGS_MANAGE_REFERENCE];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Streets and House types of /settings/property. Both lists act at once, through their own dialogs. */
export function PropertySections() {
  const { data: streets, isLoading: streetsLoading } = useStreets();
  const { data: houseTypes, isLoading: houseTypesLoading } = useHouseTypes();
  const activeStreets = streets?.filter((street) => street.is_active).length ?? 0;

  return (
    <>
      <SettingsSection
        id="streets"
        title="Streets"
        summary={streetsLoading ? 'Loading streets' : `${count(streets?.length ?? 0, 'street', 'streets')}, ${activeStreets} active`}
        permissions={REFERENCE}
        instant
      >
        <SettingsRow rowId="street-list" stacked>
          <div className="w-full">
            <StreetsList />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="house-types"
        title="House types"
        summary={houseTypesLoading ? 'Loading house types' : count(houseTypes?.length ?? 0, 'house type', 'house types')}
        permissions={REFERENCE}
        instant
      >
        <SettingsRow rowId="house-type-list" stacked>
          <div className="w-full">
            <HouseTypesList />
          </div>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
