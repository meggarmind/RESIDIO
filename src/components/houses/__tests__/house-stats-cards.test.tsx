// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { HouseStatsCards } from '@/components/houses/house-stats-cards';

afterEach(() => cleanup());

/**
 * Regression coverage for issue #109: the house detail page's Financial
 * Status card was hardcoded to `pendingDues={0}` / "Clear" regardless of the
 * property's real state, and a "Last Inspection" card asserted a compliance
 * fact ("Compliance verified") with no inspection data behind it anywhere in
 * the app. Both were fixed by wiring `pendingDues` to
 * `useHousePaymentStatus` and removing the inspection card entirely.
 *
 * The loading-state assertion is the one that protects against the original
 * defect class: a component that can render "Clear" before real data has
 * arrived is exactly how a false "no pending payments" claim gets shown.
 */
describe('HouseStatsCards', () => {
    it('renders a positive pendingDues as an outstanding amount, not Clear', () => {
        render(
            <HouseStatsCards
                occupancyStatus="occupied"
                totalResidents={3}
                pendingDues={100000}
            />
        );

        expect(screen.getByText('₦100,000')).toBeInTheDocument();
        expect(screen.getByText('Outstanding dues')).toBeInTheDocument();
        expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    });

    it('renders zero pendingDues as Clear', () => {
        render(
            <HouseStatsCards
                occupancyStatus="vacant"
                totalResidents={0}
                pendingDues={0}
            />
        );

        expect(screen.getByText('Clear')).toBeInTheDocument();
        expect(screen.getByText('No pending payments')).toBeInTheDocument();
    });

    it('renders neither Clear nor a currency figure while the payment status is loading', () => {
        const { container } = render(
            <HouseStatsCards
                occupancyStatus="occupied"
                totalResidents={2}
                pendingDues={undefined}
                isLoading
            />
        );

        expect(screen.queryByText('Clear')).not.toBeInTheDocument();
        expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
        expect(screen.queryByText('No pending payments')).not.toBeInTheDocument();
        expect(screen.queryByText('Outstanding dues')).not.toBeInTheDocument();
        // Distinguishes the loading state from the error/unknown state: a
        // skeleton placeholder must render, not the "unavailable" copy.
        expect(screen.queryByText('Payment status unavailable')).not.toBeInTheDocument();
        expect(screen.queryByText('--')).not.toBeInTheDocument();
        expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    });

    it('renders an unavailable state on error rather than a false zero', () => {
        render(
            <HouseStatsCards
                occupancyStatus="occupied"
                totalResidents={2}
                pendingDues={undefined}
                isError
            />
        );

        expect(screen.queryByText('Clear')).not.toBeInTheDocument();
        expect(screen.getByText('Payment status unavailable')).toBeInTheDocument();
    });

    it('never renders a compliance claim with no inspection data behind it', () => {
        render(
            <HouseStatsCards
                occupancyStatus="occupied"
                totalResidents={2}
                pendingDues={0}
            />
        );

        expect(screen.queryByText(/Compliance verified/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Last Inspection/i)).not.toBeInTheDocument();
    });
});
