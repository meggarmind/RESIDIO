import Link from 'next/link';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// The sidebar lists rate cards last, but a development levy needs one first (#790).
export default function BillingSettingsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-6">
            <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                    {/* One <p>: AlertDescription is a grid, so bare text nodes and links would each take a row. */}
                    <p>
                    <span className="font-medium">Setup order:</span>{' '}
                    1. <Link href="/settings/billing/profiles" className="underline">Rate cards</Link>,{' '}
                    2. <Link href="/settings/billing" className="underline">Billing rules</Link>,{' '}
                    3. <Link href="/settings/billing#levies" className="underline">Levies</Link>, which picks one of the rate cards.
                    </p>
                </AlertDescription>
            </Alert>
            {children}
        </div>
    );
}
