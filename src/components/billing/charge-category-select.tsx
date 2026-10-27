'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChargeCategories } from '@/hooks/use-billing';

/** Pick a charge category (#1189). The billing profile forms render it only for billing.manage_profiles holders. */
export function ChargeCategorySelect({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    const { data: categories } = useChargeCategories();

    return (
        <Select onValueChange={onChange} value={value} disabled={disabled}>
            <SelectTrigger aria-label="Charge category">
                <SelectValue placeholder="Select a charge category" />
            </SelectTrigger>
            <SelectContent>
                {(categories || []).map((category) => (
                    <SelectItem key={category.code} value={category.code}>
                        {category.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
