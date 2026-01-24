import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface ScoredResult {
    _score: number;
    [key: string]: any;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({
            residents: [],
            houses: [],
            payments: [],
            contacts: [],
            documents: [],
        });
    }

    try {
        const supabase = await createServerSupabaseClient();

        // Execute ALL database searches in parallel
        const [
            residentsResult,
            housesByNumberResult,
            streetsResult,
            paymentsResult,
            contactsResult,
            documentsResult,
        ] = await Promise.all([
            // Search Residents (by name, phone, email)
            supabase
                .from('residents')
                .select('id, first_name, last_name, phone_primary, email')
                .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone_primary.ilike.%${query}%,email.ilike.%${query}%`)
                .limit(5),

            // Search Houses by house_number
            supabase
                .from('houses')
                .select('id, house_number, street_id, streets(name)')
                .ilike('house_number', `%${query}%`)
                .limit(5),

            // Find streets matching the query
            supabase
                .from('streets')
                .select('id')
                .ilike('name', `%${query}%`)
                .limit(10),

            // Search Payments by reference (Table: payment_records, Column: reference_number)
            supabase
                .from('payment_records')
                .select('id, reference_number, amount')
                .or(`reference_number.ilike.%${query}%`)
                .limit(5),

            // Search Security Contacts by name (Column: full_name)
            supabase
                .from('security_contacts')
                .select('id, full_name, phone_primary')
                .ilike('full_name', `%${query}%`)
                .limit(5),

            // Search Documents by title (Join category for name)
            supabase
                .from('documents')
                .select('id, title, category:document_categories(name)')
                .ilike('title', `%${query}%`)
                .limit(5),
        ]);

        // Process Houses - need additional query if streets matched
        const housesByNumber = housesByNumberResult.data || [];
        const matchingStreetIds = (streetsResult.data || []).map((s) => s.id);
        let housesByStreet: typeof housesByNumber = [];

        if (matchingStreetIds.length > 0) {
            const { data, error } = await supabase
                .from('houses')
                .select('id, house_number, street_id, streets(name)')
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

        // Search Payments by reference scoring
        const payments = (paymentsResult.data || []).map(p => ({
            ...p,
            _score: calculateScore(p.reference_number || '', query)
        }));

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
                    calculateScore(streetName || '', query)
                )
            };
        });

        // Log errors if any (but return partial results)
        if (residentsResult.error) console.error('API Resident search error:', residentsResult.error);
        if (housesByNumberResult.error) console.error('API House search error:', housesByNumberResult.error);
        if (paymentsResult.error) console.error('API Payment search error:', paymentsResult.error);
        if (contactsResult.error) console.error('API Security Contact search error:', contactsResult.error);
        if (documentsResult.error) console.error('API Document search error:', documentsResult.error);

        // Calculate total results
        const totalResults =
            residents.length +
            formattedHouses.length +
            payments.length +
            contacts.length +
            formattedDocuments.length;

        // Log search query
        if (query.length >= 2) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('search_logs').insert({
                    query_text: query,
                    user_id: user.id,
                    results_count: totalResults
                });
            }
        }

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
