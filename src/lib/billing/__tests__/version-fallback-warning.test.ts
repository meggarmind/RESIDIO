import { describe, expect, it } from 'vitest';

import {
    describeVersionFallback,
    resolveBillableCandidates,
    resolveProfileVersion,
    resolveProfileVersionWithFallback,
    type BillingProfileVersion,
    type GenerationHouse,
    type GenerationProfile,
} from '@/lib/billing/invoice-generation';

/**
 * #242: `resolveProfileVersion` prices a period that predates the rate schedule
 * with the EARLIEST version rather than throwing, and reports success. The
 * fallback stays (#78 depends on generation not throwing) -- these tests pin
 * that it is now also reported.
 */

const augustVersion: BillingProfileVersion = {
    id: 'version-aug',
    billingProfileId: 'profile-1',
    effectiveFrom: '2026-08-01',
    items: [{ id: 'item-1', name: 'Security Dues', amount: 10000, frequency: 'monthly' }],
};

const februaryVersion: BillingProfileVersion = {
    id: 'version-feb',
    billingProfileId: 'profile-1',
    effectiveFrom: '2026-02-01',
    items: [{ id: 'item-2', name: 'Security Dues', amount: 6000, frequency: 'monthly' }],
};

const profile: GenerationProfile = {
    id: 'profile-1',
    name: 'Standard 3-Bed Rate',
    targetType: 'house',
    applicableRoles: null,
};

const house = (id: string, label: string): GenerationHouse => ({
    id,
    label,
    streetId: 'street-1',
    billingProfileId: 'profile-1',
    propertyStatus: 'occupied',
    isActive: true,
    residents: [
        { id: `${id}-tenant`, name: 'A Tenant', accountStatus: 'active', role: 'tenant', moveInDate: null, isActive: true },
    ],
});

const request = (targetMonth: string, fromMonth?: string) => ({
    mode: fromMonth ? ('backfill' as const) : ('selected_month' as const),
    targetMonth,
    fromMonth,
    trigger: 'manual' as const,
});

describe('resolveProfileVersionWithFallback', () => {
    it('reports no fallback when a version is genuinely effective for the period', () => {
        const resolved = resolveProfileVersionWithFallback('2026-08-01', [augustVersion]);
        expect(resolved.version.id).toBe('version-aug');
        expect(resolved.usedFallback).toBe(false);
    });

    it('flags the fallback when the period predates every version', () => {
        const resolved = resolveProfileVersionWithFallback('2026-05-01', [augustVersion]);
        expect(resolved.version.id).toBe('version-aug');
        expect(resolved.usedFallback).toBe(true);
    });

    it('returns the earliest version, not merely any version, when it falls back', () => {
        const resolved = resolveProfileVersionWithFallback('2026-01-01', [augustVersion, februaryVersion]);
        expect(resolved.version.id).toBe('version-feb');
        expect(resolved.usedFallback).toBe(true);
    });

    it('leaves resolveProfileVersion behaviour unchanged', () => {
        // #78 depends on this not throwing for a pre-schedule period.
        expect(resolveProfileVersion('2026-05-01', [augustVersion]).id).toBe('version-aug');
        expect(resolveProfileVersion('2026-08-01', [augustVersion, februaryVersion]).id).toBe('version-aug');
        expect(() => resolveProfileVersion('2026-05-01', [])).toThrow(/No billing profile version/);
    });
});

describe('resolveBillableCandidates version fallbacks', () => {
    it('reports nothing when every period has an effective version', () => {
        const result = resolveBillableCandidates({
            request: request('2026-08-01'),
            profiles: [profile],
            versions: [augustVersion],
            houses: [house('house-1', 'A1')],
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.versionFallbacks).toEqual([]);
    });

    it('still produces the candidate but records the fallback for a pre-schedule period', () => {
        const result = resolveBillableCandidates({
            request: request('2026-05-01'),
            profiles: [profile],
            versions: [augustVersion],
            houses: [house('house-1', 'A1')],
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.skips).toEqual([]);
        expect(result.versionFallbacks).toEqual([
            {
                houseId: 'house-1',
                house: 'A1',
                billingProfileId: 'profile-1',
                billingProfileName: 'Standard 3-Bed Rate',
                periodStart: '2026-05-01',
                versionId: 'version-aug',
                effectiveFrom: '2026-08-01',
            },
        ]);
    });

    it('records one fallback per affected period in a backfill, and none for covered periods', () => {
        const result = resolveBillableCandidates({
            request: request('2026-09-01', '2026-06-01'),
            profiles: [profile],
            versions: [augustVersion],
            houses: [house('house-1', 'A1')],
        });

        expect(result.candidates).toHaveLength(4);
        expect(result.versionFallbacks.map((warning) => warning.periodStart)).toEqual(['2026-06-01', '2026-07-01']);
    });

    it('describes the fallback in terms an admin can act on', () => {
        const [warning] = resolveBillableCandidates({
            request: request('2026-05-01'),
            profiles: [profile],
            versions: [augustVersion],
            houses: [house('house-1', 'A1')],
        }).versionFallbacks;

        const message = describeVersionFallback(warning);
        expect(message).toContain('A1');
        expect(message).toContain('2026-05');
        expect(message).toContain('Standard 3-Bed Rate');
        expect(message).toContain('2026-08-01');
        expect(message).toMatch(/no version was in effect/i);
    });

    it('does not double-report a period for a resident-targeted profile with several residents', () => {
        const residentProfile: GenerationProfile = { ...profile, targetType: 'resident', applicableRoles: ['tenant', 'resident_landlord'] };
        const sharedHouse: GenerationHouse = {
            ...house('house-1', 'A1'),
            residents: [
                { id: 'r1', name: 'Tenant One', accountStatus: 'active', role: 'tenant', moveInDate: null, isActive: true },
                { id: 'r2', name: 'Landlord One', accountStatus: 'active', role: 'resident_landlord', moveInDate: null, isActive: true },
            ],
        };

        const result = resolveBillableCandidates({
            request: request('2026-05-01'),
            profiles: [residentProfile],
            versions: [augustVersion],
            houses: [sharedHouse],
        });

        expect(result.candidates).toHaveLength(2);
        expect(result.versionFallbacks).toHaveLength(1);
    });
});
