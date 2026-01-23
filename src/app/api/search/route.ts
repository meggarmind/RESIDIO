import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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

        // Flatten house streets for simplified response
        const formattedHouses = houses.map((h) => {
            const streetData = h.streets as { name: string } | { name: string }[] | null;
            const streetName = Array.isArray(streetData)
                ? streetData[0]?.name
                : streetData?.name;

            return {
                id: h.id,
                house_number: h.house_number,
                street_name: streetName || null,
            };
        });

        // Handle Documents category flattening
        const formattedDocuments = (documentsResult.data || []).map((d) => {
            const categoryData = d.category as { name: string } | { name: string }[] | null;
            const categoryName = Array.isArray(categoryData)
                ? categoryData[0]?.name
                : categoryData?.name;

            return {
                id: d.id,
                title: d.title,
                category: categoryName || null,
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
            (residentsResult.data?.length || 0) +
            formattedHouses.length +
            (paymentsResult.data?.length || 0) +
            (contactsResult.data?.length || 0) +
            formattedDocuments.length;

        // Log search query (non-blocking if possible, but await to ensure execution in lambda)
        // Only log if query is substantial to avoid noise
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

        return NextResponse.json({
            residents: residentsResult.data || [],
            houses: formattedHouses,
            payments: paymentsResult.data || [],
            contacts: contactsResult.data || [],
            documents: formattedDocuments,
        });

    } catch (error) {
        console.error('Global Search API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
