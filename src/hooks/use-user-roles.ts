'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from './use-residents';
import type { ResidentRole } from '@/types/database';

export type PortalMode = 'home' | 'portfolio';

export interface UserRolesHook {
    isLoading: boolean;
    // Raw roles
    roles: ResidentRole[];
    // Calculated flags
    isMixedRole: boolean;
    hasLandlordRole: boolean; // Owns at least one property
    hasResidentRole: boolean; // Lives in at least one property
    // Mode management
    mode: PortalMode;
    setMode: (mode: PortalMode) => void;
    // Available modes for this user
    availableModes: PortalMode[];
}

/**
 * Hook to determine the current user's roles and support the Hybrid View (Home vs Portfolio)
 */
export function useUserRoles(): UserRolesHook {
    const { residentId } = useAuth();
    const { data: resident, isLoading } = useResident(residentId || undefined);

    // Initialize mode from localStorage if available, otherwise default depending on roles
    const [mode, setModeState] = useState<PortalMode>('home');

    // Compute roles and derived state
    const { roles, hasLandlordRole, hasResidentRole, isMixedRole, availableModes } = useMemo(() => {
        if (!resident?.resident_houses) {
            return {
                roles: [],
                hasLandlordRole: false,
                hasResidentRole: false,
                isMixedRole: false,
                availableModes: ['home'] as PortalMode[],
            };
        }

        // Filter active houses only
        const activeHouses = resident.resident_houses.filter((rh) => rh.is_active);

        // Get unique roles
        const uniqueRoles = Array.from(new Set(activeHouses.map((rh) => rh.resident_role)));

        // Determine specific role types
        const landlordRoles: ResidentRole[] = ['resident_landlord', 'non_resident_landlord', 'developer'];
        const residentRoles: ResidentRole[] = ['resident_landlord', 'tenant', 'co_resident', 'household_member'];

        const hasLandlord = activeHouses.some((rh) => landlordRoles.includes(rh.resident_role));
        const hasResident = activeHouses.some((rh) => residentRoles.includes(rh.resident_role));

        // Mixed role if they have capabilities in both domains
        // Example: Resident Landlord (lives in one, owns it) -> fits both, but often just needs One View
        // BUT checking the spec: 
        // "Resident Landlord living in A and owning B & C" -> Mixed Role.
        // So we check if they have multiple properties OR conflicting role types?
        // Let's stick to the Spec:
        // "My Home" = Live-in properties. "My Portfolio" = Owned properties.
        // If user has BOTH live-in AND owned properties (even if it's the same property? No, same property is usually Home view).

        // Simplification: 
        // - Mixed Role = Can access BOTH Home and Portfolio views.
        // - Home View Available = Has 'resident_landlord', 'tenant', 'co_resident' etc.
        // - Portfolio View Available = Has 'resident_landlord', 'non_resident_landlord', 'developer'.

        const modes: PortalMode[] = [];
        if (hasResident) modes.push('home');
        if (hasLandlord) modes.push('portfolio');

        // If no specific roles found (edge case), default to home
        if (modes.length === 0) modes.push('home');

        return {
            roles: uniqueRoles,
            hasLandlordRole: hasLandlord,
            hasResidentRole: hasResident,
            isMixedRole: modes.length > 1,
            availableModes: modes,
        };
    }, [resident]);

    // Persist mode selection
    const setMode = (newMode: PortalMode) => {
        if (!availableModes.includes(newMode)) return;
        setModeState(newMode);
        localStorage.setItem('residio-portal-mode', newMode);
    };

    // Hydrate mode from storage on mount or when availableModes change
    useEffect(() => {
        const savedMode = localStorage.getItem('residio-portal-mode') as PortalMode;
        if (savedMode && availableModes.includes(savedMode)) {
            setModeState(savedMode);
        } else {
            // Default priority: Home > Portfolio
            if (availableModes.includes('home')) {
                setModeState('home');
            } else if (availableModes.includes('portfolio')) {
                setModeState('portfolio');
            }
        }
    }, [availableModes]);

    return {
        isLoading,
        roles,
        isMixedRole,
        hasLandlordRole,
        hasResidentRole,
        mode,
        setMode,
        availableModes,
    };
}
