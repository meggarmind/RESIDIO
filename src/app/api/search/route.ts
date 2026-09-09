import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUserPermissions } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

interface ScoredResult {
    _score: number;
}

const EMPTY_RESULTS = {
    residents: [],
    houses: [],
    payments: [],
    contacts: [],
    documents: [],
};

/** Placeholder for a query skipped because the caller lacks the permission
 * that gates it -- shaped like a Supabase response so it can sit in the same
 * `Promise.all` as the real queries below without a separate branch. */
const SKIPPED = Promise.resolve({ data: [], error: null });

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    // Global search is admin-only data (residents, houses, payments, security
    // contacts, documents). Unlike page routes, /api/** is exempt from the
    // middleware's login redirect, so this endpoint is reachable by anyone who
    // can reach the app at all unless it checks for itself -- previously it
    // only called getUser() to attach a user_id to the search_logs insert,
    // never to gate access.
    const { userId, permissions } = await getCurrentUserPermissions();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!query || query.length < 2) {
        return NextResponse.json(EMPTY_RESULTS);
    }

    // Each result category is scoped by the same permission that gates the
    // page it lives on (see ROUTE_PERMISSIONS in action-roles.ts), so search
    // never surfaces a record type the caller couldn't otherwise open.
    const canViewResidents = permissions.includes(PERMISSIONS.RESIDENTS_VIEW);
    const canViewHouses = permissions.includes(PERMISSIONS.HOUSES_VIEW);
    const canViewPayments = permissions.includes(PERMISSIONS.PAYMENTS_VIEW);
    const canViewContacts = permissions.includes(PERMISSIONS.SECURITY_VIEW);
    const canViewDocuments = permissions.includes(PERMISSIONS.DOCUMENTS_VIEW);

    try {
        const supabase = await createServerSupabaseClient();

        // Execute ALL database searches in parallel. A category the caller
        // lacks permission for is never queried -- it costs nothing rather
        // than being queried and discarded.
        const [
            residentsResult,
            housesByNumberResult,
            streetsResult,
            paymentsByReferenceResult,
            residentsForPaymentsResult,
            contactsResult,
            documentsResult,
        ] = await Promise.all([
            // Search Residents (by name, phone, email)
            canViewResidents
                ? supabase
                    .from('residents')
                    .select('id, first_name, last_name, phone_primary, email')
                    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone_primary.ilike.%${query}%,email.ilike.%${query}%`)
                    .limit(5)
                : SKIPPED,

            // Search Houses by house_number or short_name (the "House ID" shown
            // on /houses -- previously missing entirely, so a value like
            // "IBB-1" never matched anything).
            canViewHouses
                ? supabase
                    .from('houses')
                    .select('id, house_number, short_name, street_id, streets(name)')
                    .or(`house_number.ilike.%${query}%,short_name.ilike.%${query}%`)
                    .limit(5)
                : SKIPPED,

            // Find streets matching the query (only needed to widen the house search)
            canViewHouses
                ? supabase
                    .from('streets')
                    .select('id')
                    .ilike('name', `%${query}%`)
                    .limit(10)
                : SKIPPED,

            // Search Payments by reference (Table: payment_records, Column: reference_number)
            canViewPayments
                ? supabase
                    .from('payment_records')
                    .select('id, reference_number, amount, resident_id')
                    .or(`reference_number.ilike.%${query}%`)
                    .limit(5)
                : SKIPPED,

            // Find residents matching the query (only needed to widen the payment
            // search to resident name -- mirrors the streets-widen-houses pattern
            // above). Gated by canViewPayments, NOT canViewResidents: a caller
            // holding payments.view already sees resident first/last name on the
            // payment detail page today (src/actions/payments/get-payment.ts
            // joins `residents` unconditionally, and `/payments` is gated by
            // payments.view alone in ROUTE_PERMISSIONS) -- so this widening query
            // requires no new permission and grants no new visibility. It selects
            // only `id` + the two name fields needed for scoring, never returned
            // to the client.
            canViewPayments
                ? supabase
                    .from('residents')
                    .select('id, first_name, last_name')
                    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
                    .limit(10)
                : SKIPPED,

            // Search Security Contacts by name (Column: full_name)
            canViewContacts
                ? supabase
                    .from('security_contacts')
                    .select('id, full_name, phone_primary')
                    .ilike('full_name', `%${query}%`)
                    .limit(5)
                : SKIPPED,

            // Search Documents by title (Join category for name)
            canViewDocuments
                ? supabase
                    .from('documents')
                    .select('id, title, category:document_categories(name)')
                    .ilike('title', `%${query}%`)
                    .limit(5)
                : SKIPPED,
        ]);

        // Process Houses - need additional query if streets matched
        const housesByNumber = housesByNumberResult.data || [];
        const matchingStreetIds = (streetsResult.data || []).map((s) => s.id);
        let housesByStreet: typeof housesByNumber = [];

        if (canViewHouses && matchingStreetIds.length > 0) {
            const { data, error } = await supabase
                .from('houses')
                .select('id, house_number, short_name, street_id, streets(name)')
                .in('street_id', matchingStreetIds)
                .limit(5);

            if (error) {
                console.error('Houses by street search error:', error);
            }
            housesByStreet = data || [];
        }

        // Merge and deduplicate house results
        const houseMap = new Map<string, (typeof housesByNumber)[number]>();
        [...housesByNumber, ...housesByStreet].forEach((h) => {
            if (!houseMap.has(h.id)) houseMap.set(h.id, h);
        });
        const houses = Array.from(houseMap.values()).slice(0, 5);

        // Process Payments - widen the reference-number match with a second
        // pass keyed on resident_id, using the resident-name matches found
        // above. Mirrors the streets-widen-houses pattern.
        const paymentsByReference = paymentsByReferenceResult.data || [];
        const matchingResidentsForPayments = residentsForPaymentsResult.data || [];
        const matchingResidentIdsForPayments = matchingResidentsForPayments.map((r: { id: string }) => r.id);
        let paymentsByResident: typeof paymentsByReference = [];

        if (canViewPayments && matchingResidentIdsForPayments.length > 0) {
            const { data, error } = await supabase
                .from('payment_records')
                .select('id, reference_number, amount, resident_id')
                .in('resident_id', matchingResidentIdsForPayments)
                .limit(5);

            if (error) {
                console.error('Payments by resident search error:', error);
            }
            paymentsByResident = data || [];
        }

        // Merge and deduplicate payment results
        const paymentMap = new Map<string, (typeof paymentsByReference)[number]>();
        [...paymentsByReference, ...paymentsByResident].forEach((p) => {
            if (!paymentMap.has(p.id)) paymentMap.set(p.id, p);
        });
        const mergedPayments = Array.from(paymentMap.values()).slice(0, 5);


        // Helper to calculate relevance score
        const calculateScore = (target: string, query: string) => {
            const t = target.toLowerCase();
            const q = query.toLowerCase();
            if (t === q) return 100; // Exact match
            if (t.startsWith(q)) return 80; // Prefix match
            if (t.includes(` ${q}`)) return 60; // Word start match
            return 40; // Mid-string match
        };

        // Process Residents with scoring
        const residents = (residentsResult.data || []).map(r => ({
            ...r,
            _score: Math.max(
                calculateScore(`${r.first_name} ${r.last_name}`, query),
                calculateScore(r.first_name, query),
                calculateScore(r.last_name, query)
            )
        }));

        // Handle Documents category flattening and scoring
        const formattedDocuments = (documentsResult.data || []).map((d) => {
            const categoryData = d.category as { name: string } | { name: string }[] | null;
            const categoryName = Array.isArray(categoryData)
                ? categoryData[0]?.name
                : categoryData?.name;

            return {
                id: d.id,
                title: d.title,
                category: categoryName || null,
                _score: calculateScore(d.title, query)
            };
        });

        // Search Payments scoring. A payment can match on reference_number,
        // on its resident's name (via the widening query above), or both --
        // score it by the best of whichever matched. `residentNameById` maps
        // the resident-widening query's results back onto the merged payment
        // rows so a resident-name match gets a real score instead of a flat
        // constant; resident_id itself is stripped from the response below
        // (the client only ever consumed id/reference_number/amount/_score).
        const residentNameById = new Map<string, string>(
            matchingResidentsForPayments.map((r: { id: string; first_name: string; last_name: string }) => [r.id, `${r.first_name} ${r.last_name}`])
        );
        const payments = mergedPayments.map(p => {
            const residentName = p.resident_id ? residentNameById.get(p.resident_id) : undefined;
            return {
                id: p.id,
                reference_number: p.reference_number,
                amount: p.amount,
                _score: Math.max(
                    calculateScore(p.reference_number || '', query),
                    residentName ? calculateScore(residentName, query) : 0
                ),
            };
        });

        // Search Security Contacts scoring
        const contacts = (contactsResult.data || []).map(c => ({
            ...c,
            _score: calculateScore(c.full_name, query)
        }));

        // Flatten house streets for simplified response and scoring
        const formattedHouses = houses.map((h) => {
            const streetData = h.streets as { name: string } | { name: string }[] | null;
            const streetName = Array.isArray(streetData)
                ? streetData[0]?.name
                : streetData?.name;

            return {
                id: h.id,
                house_number: h.house_number,
                street_name: streetName || null,
                _score: Math.max(
                    calculateScore(h.house_number, query),
                    calculateScore(h.short_name || '', query),
                    calculateScore(streetName || '', query)
                )
            };
        });

        // Log errors if any (but return partial results)
        if (residentsResult.error) console.error('API Resident search error:', residentsResult.error);
        if (housesByNumberResult.error) console.error('API House search error:', housesByNumberResult.error);
        if (paymentsByReferenceResult.error) console.error('API Payment search error:', paymentsByReferenceResult.error);
        if (residentsForPaymentsResult.error) console.error('API Payment-by-resident search error:', residentsForPaymentsResult.error);
        if (contactsResult.error) console.error('API Security Contact search error:', contactsResult.error);
        if (documentsResult.error) console.error('API Document search error:', documentsResult.error);

        // Calculate total results
        const totalResults =
            residents.length +
            formattedHouses.length +
            payments.length +
            contacts.length +
            formattedDocuments.length;

        // Log search query. `userId` was already resolved by the permission
        // check above, so this doesn't need its own auth.getUser() call.
        await supabase.from('search_logs').insert({
            query_text: query,
            user_id: userId,
            results_count: totalResults
        });

        // Return sorted results within each group (or keep grouped but scored)
        return NextResponse.json({
            residents: (residents as ScoredResult[]).sort((a, b) => b._score - a._score),
            houses: (formattedHouses as ScoredResult[]).sort((a, b) => b._score - a._score),
            payments: (payments as ScoredResult[]).sort((a, b) => b._score - a._score),
            contacts: (contacts as ScoredResult[]).sort((a, b) => b._score - a._score),
            documents: (formattedDocuments as ScoredResult[]).sort((a, b) => b._score - a._score),
        });

    } catch (error) {
        console.error('Global Search API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
