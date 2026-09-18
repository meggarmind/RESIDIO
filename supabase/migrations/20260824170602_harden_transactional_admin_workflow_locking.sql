CREATE OR REPLACE FUNCTION public.execute_property_transition(
    p_request_key TEXT,
    p_transition_type TEXT,
    p_house_id UUID,
    p_target_resident_id UUID,
    p_target_role public.resident_role,
    p_staff_actions JSONB,
    p_transition_date DATE,
    p_notes TEXT,
    p_created_by UUID
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_existing public.property_transition_requests%ROWTYPE;
    v_source public.resident_houses%ROWTYPE;
    v_target public.residents%ROWTYPE;
    v_source_role public.resident_role;
    v_stats JSONB;
    v_requested_count INTEGER;
    v_matched_count INTEGER;
BEGIN
    IF p_request_key IS NULL OR btrim(p_request_key) = '' THEN
        RAISE EXCEPTION 'Property transition request key is required';
    END IF;
    IF p_transition_type = 'developer_to_owner' THEN
        v_source_role := 'developer';
        IF p_target_role NOT IN ('resident_landlord', 'non_resident_landlord') THEN
            RAISE EXCEPTION 'Invalid owner role';
        END IF;
    ELSIF p_transition_type = 'landlord_to_tenant' THEN
        v_source_role := 'non_resident_landlord';
        IF p_target_role <> 'tenant' THEN
            RAISE EXCEPTION 'Invalid tenant role';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported property transition type';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key, 0));
    SELECT * INTO v_existing FROM public.property_transition_requests WHERE request_key = p_request_key;
    IF FOUND THEN
        IF v_existing.house_id <> p_house_id THEN
            RAISE EXCEPTION 'Transition request key belongs to another property';
        END IF;
        RETURN v_existing.result || jsonb_build_object('existing', true);
    END IF;

    PERFORM 1 FROM public.houses WHERE id = p_house_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Property not found'; END IF;

    SELECT * INTO STRICT v_source
    FROM public.resident_houses
    WHERE house_id = p_house_id AND resident_role = v_source_role AND is_active = true
    FOR UPDATE;

    SELECT * INTO STRICT v_target
    FROM public.residents
    WHERE id = p_target_resident_id
    FOR UPDATE;

    IF v_target.entity_type = 'corporate' AND p_target_role IN ('resident_landlord', 'tenant') THEN
        RAISE EXCEPTION 'Corporate entity is not eligible for the requested role';
    END IF;
    IF EXISTS (SELECT 1 FROM public.resident_houses WHERE house_id = p_house_id AND resident_id = p_target_resident_id AND is_active = true) THEN
        RAISE EXCEPTION 'Target resident is already assigned to this property';
    END IF;
    IF p_transition_type = 'landlord_to_tenant' AND EXISTS (
        SELECT 1 FROM public.resident_houses WHERE house_id = p_house_id AND resident_role = 'tenant' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Property already has an active tenant';
    END IF;

    CREATE TEMP TABLE transition_staff_actions ON COMMIT DROP AS
    SELECT assignment_id, action, new_sponsor_id, keep_until_date
    FROM jsonb_to_recordset(COALESCE(p_staff_actions, '[]'::JSONB)) AS action_row(
        assignment_id UUID, action TEXT, new_sponsor_id UUID, keep_until_date DATE
    );

    IF EXISTS (SELECT 1 FROM transition_staff_actions WHERE action NOT IN ('remove', 'transfer', 'keep_until_date')) THEN
        RAISE EXCEPTION 'Invalid staff transition action';
    END IF;
    IF EXISTS (SELECT 1 FROM transition_staff_actions WHERE action = 'transfer' AND new_sponsor_id IS NULL AND p_transition_type = 'developer_to_owner') THEN
        RAISE EXCEPTION 'Transfer action requires a sponsor';
    END IF;

    SELECT COUNT(*) INTO v_requested_count FROM transition_staff_actions;
    PERFORM 1
    FROM public.resident_houses rh
    JOIN transition_staff_actions action_row ON action_row.assignment_id = rh.id
    WHERE rh.house_id = p_house_id AND rh.is_active = true
    FOR UPDATE OF rh;
    SELECT COUNT(*) INTO v_matched_count
    FROM public.resident_houses rh
    JOIN transition_staff_actions action_row ON action_row.assignment_id = rh.id
    WHERE rh.house_id = p_house_id AND rh.is_active = true;
    IF v_requested_count <> v_matched_count THEN
        RAISE EXCEPTION 'One or more staff assignments are unavailable';
    END IF;

    INSERT INTO public.house_ownership_history (house_id, resident_id, resident_role, event_type, event_date, notes, is_current, created_by)
    SELECT rh.house_id, rh.resident_id, rh.resident_role, 'move_out', p_transition_date,
           COALESCE(p_notes, 'Removed during property transition'), false, p_created_by
    FROM public.resident_houses rh
    JOIN transition_staff_actions action_row ON action_row.assignment_id = rh.id
    WHERE action_row.action = 'remove';

    UPDATE public.resident_houses rh
    SET is_active = false, move_out_date = p_transition_date
    FROM transition_staff_actions action_row
    WHERE action_row.assignment_id = rh.id AND action_row.action = 'remove';

    UPDATE public.resident_houses rh
    SET sponsor_resident_id = CASE WHEN p_transition_type = 'landlord_to_tenant' THEN p_target_resident_id ELSE action_row.new_sponsor_id END
    FROM transition_staff_actions action_row
    WHERE action_row.assignment_id = rh.id AND action_row.action = 'transfer';

    UPDATE public.resident_houses rh
    SET sponsor_resident_id = p_target_resident_id,
        tags = ARRAY['expires_' || COALESCE(action_row.keep_until_date, p_transition_date)::TEXT]
    FROM transition_staff_actions action_row
    WHERE action_row.assignment_id = rh.id AND action_row.action = 'keep_until_date';

    IF p_transition_type = 'developer_to_owner' THEN
        UPDATE public.resident_houses SET is_active = false, move_out_date = p_transition_date WHERE id = v_source.id;
    END IF;

    INSERT INTO public.resident_houses (resident_id, house_id, resident_role, move_in_date, move_out_date, is_active, created_by)
    VALUES (p_target_resident_id, p_house_id, p_target_role, p_transition_date, NULL, true, p_created_by)
    ON CONFLICT (resident_id, house_id) DO UPDATE
    SET resident_role = EXCLUDED.resident_role, move_in_date = EXCLUDED.move_in_date,
        move_out_date = NULL, is_active = true, created_by = EXCLUDED.created_by;

    UPDATE public.residents SET account_status = 'active', updated_by = p_created_by
    WHERE id = p_target_resident_id AND account_status = 'inactive';

    IF p_transition_type = 'developer_to_owner' THEN
        UPDATE public.house_ownership_history SET is_current = false WHERE house_id = p_house_id AND is_current = true;
        INSERT INTO public.house_ownership_history (house_id, resident_id, resident_role, event_type, event_date, notes, is_current, created_by)
        VALUES
            (p_house_id, v_source.resident_id, v_source.resident_role, 'ownership_end', p_transition_date, p_notes, false, p_created_by),
            (p_house_id, p_target_resident_id, p_target_role, 'ownership_transfer', p_transition_date, p_notes, true, p_created_by);
    ELSE
        INSERT INTO public.house_ownership_history (house_id, resident_id, resident_role, event_type, event_date, notes, is_current, created_by)
        VALUES (p_house_id, p_target_resident_id, p_target_role, 'move_in', p_transition_date, p_notes, true, p_created_by);
    END IF;

    SELECT jsonb_build_object(
        'staff_removed', COUNT(*) FILTER (WHERE action = 'remove'),
        'staff_transferred', COUNT(*) FILTER (WHERE action = 'transfer'),
        'staff_extended', COUNT(*) FILTER (WHERE action = 'keep_until_date')
    ) INTO v_stats FROM transition_staff_actions;

    v_stats := jsonb_build_object('success', true, 'stats', v_stats);
    INSERT INTO public.property_transition_requests (request_key, house_id, result) VALUES (p_request_key, p_house_id, v_stats);
    RETURN v_stats;
EXCEPTION
    WHEN NO_DATA_FOUND THEN RAISE EXCEPTION 'Required property transition record was not found';
    WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'Property transition state is ambiguous';
END;
$$;
