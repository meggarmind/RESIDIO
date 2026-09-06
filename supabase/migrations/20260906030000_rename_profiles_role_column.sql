-- Migration: rename profiles.role -> role_deprecated_do_not_use
-- Issue: #193 (epic #182, slice 10) -- retire the legacy role vocabulary
--
-- WHY A RENAME RATHER THAN A DROP
-- The legacy `profiles.role` column is dead vocabulary (ADR-0007): every
-- authorization decision now goes through `role_id` -> `app_roles` ->
-- `role_permissions`, and `handle_new_user()` has written NULL into the legacy
-- column since #188. #194 drops it. This slice renames it first so that any
-- reader nobody found fails loudly on an unknown column instead of silently
-- reading NULL -- which, for an authorization predicate, means denying access
-- to someone who should have it, with no error anywhere.
--
-- WHAT THE RENAME DOES *NOT* CATCH -- measured, do not restate this wrongly
-- PostgreSQL stores RLS policy expressions parsed, not as text, so
-- `ALTER TABLE ... RENAME COLUMN` silently rewrites every dependent policy to
-- follow the new name. Probed live inside a rolled-back transaction: all four
-- remaining legacy policies followed the rename and reported healthy. The
-- fail-loud property of this migration therefore applies to *string-based*
-- readers only -- application code, the seed/verify scripts, and late-bound
-- plpgsql. Removing the last policy readers is #213 and #214, not this slice.
--
-- THE TWO FUNCTIONS ARE REWRITTEN HERE, NOT LEFT TO FAIL
-- plpgsql resolves column names at execution time, so neither function would
-- error at migration time; they would break at first call instead. Both are
-- therefore replaced in the same transaction as the rename.
--
--   handle_new_user()          -- inserted a hardcoded NULL into the legacy
--                                 column. It now omits the column entirely.
--
--   create_generated_invoice() -- authorized off the legacy column with the
--                                 literal list ('admin', 'chairman',
--                                 'financial_secretary'). Replaced by
--                                 public.has_permission('billing.create_invoice').
--
--     THE ACCESS DELTA -- this is NOT access-preserving, state it accurately.
--     Verified against LEGACY_ROLE_MAP (src/actions/roles/assign-role.ts:258)
--     and role_permissions:
--
--       LEGACY_ROLE_MAP has four keys only -- super_admin -> 'admin',
--       chairman -> 'chairman', financial_officer -> 'financial_secretary',
--       security_officer -> 'security_officer'. Its own docstring says the
--       rest ("vice_chairman, secretary, project_manager, resident") map to
--       NULL. So the legacy literal list admitted super_admin, chairman and
--       financial_officer, and *denied* vice_chairman, whose legacy column is
--       NULL.
--
--       billing.create_invoice is held by super_admin, chairman,
--       vice_chairman and financial_officer.
--
--     The swap therefore changes access in two directions:
--       WIDENS   -- vice_chairman gains access it does not hold today. This is
--                   the epic's intent: vice_chairman genuinely holds
--                   billing.create_invoice, and was excluded only as an
--                   artefact of the legacy column never being written for it.
--       NARROWS  -- has_permission() additionally requires
--                   approval_status = 'active'; the legacy clause did not, so
--                   pending/suspended/rejected accounts are now excluded.
--
--     Nothing changes in production today regardless, because the guard is
--     unreachable on its only call path (see below).
--
--     Only the NOT EXISTS clause changes. The
--     `auth.uid() IS DISTINCT FROM p_actor_id` half of the guard, and the whole
--     ~165-line invoicing body, are reproduced byte for byte from the
--     definition captured in docs/validation/.
--
--     The guard is unreachable on today's only call path --
--     src/lib/billing/invoice-generation-worker.ts uses createAdminClient(), so
--     auth.uid() is NULL and the whole IF short-circuits. It is kept, not
--     deleted, because it is what stands between a future user-JWT caller and
--     unauthorised invoice creation.
--
-- Application and script readers of the legacy column are updated in the same
-- change; src/__tests__/rename-profiles-role-column.test.ts scans src/** and
-- scripts/** so a missed reader fails the suite rather than production.

-- ROLLBACK:
-- BEGIN;
--
-- ALTER TABLE public.profiles RENAME COLUMN role_deprecated_do_not_use TO role;
--
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
-- AS $function$
-- BEGIN
--     INSERT INTO public.profiles (id, email, full_name, role, role_id, approval_status)
--     VALUES (
--         NEW.id,
--         NEW.email,
--         COALESCE(
--             NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
--             NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
--             NEW.email
--         ),
--         NULL,       -- legacy role: deprecated, never trusted
--         NULL,       -- role_id: assigned by an administrator on approval
--         'pending'   -- no access until approved
--     )
--     ON CONFLICT (id) DO NOTHING;
--
--     RETURN NEW;
-- END;
-- $function$
--
-- CREATE OR REPLACE FUNCTION public.create_generated_invoice(p_candidate_id uuid, p_actor_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--     v_candidate public.invoice_generation_candidates%ROWTYPE;
--     v_invoice_id UUID;
--     v_invoice_number TEXT;
--     v_wallet_result JSONB := '{}'::jsonb;
--     v_wallet_allocated NUMERIC(12, 2) := 0;
--     v_item JSONB;
--     v_item_total NUMERIC(12, 2);
-- BEGIN
--     IF auth.uid() IS NOT NULL AND (
--         auth.uid() IS DISTINCT FROM p_actor_id
--         OR NOT EXISTS (
--             SELECT 1 FROM public.profiles
--             WHERE id = auth.uid()
--               AND role IN ('admin', 'chairman', 'financial_secretary')
--         )
--     ) THEN
--         RAISE EXCEPTION 'Not authorised to create generated invoices';
--     END IF;
--
--     SELECT * INTO v_candidate
--     FROM public.invoice_generation_candidates
--     WHERE id = p_candidate_id
--     FOR UPDATE;
--
--     IF NOT FOUND THEN
--         RAISE EXCEPTION 'Invoice generation candidate % not found', p_candidate_id;
--     END IF;
--     IF v_candidate.status IN ('created', 'skipped', 'cancelled') THEN
--         RETURN jsonb_build_object(
--             'status', v_candidate.status,
--             'invoice_id', v_candidate.invoice_id,
--             'amount', v_candidate.amount_due,
--             'wallet_allocated', v_candidate.wallet_allocated
--         );
--     END IF;
--     IF v_candidate.status = 'failed' THEN
--         RAISE EXCEPTION 'Invoice generation candidate % has failed and must be retried explicitly', p_candidate_id;
--     END IF;
--
--     BEGIN
--         IF jsonb_typeof(v_candidate.invoice_items) <> 'array'
--            OR jsonb_array_length(v_candidate.invoice_items) = 0 THEN
--             RAISE EXCEPTION 'Invoice generation candidate % requires at least one invoice item', p_candidate_id;
--         END IF;
--
--         SELECT sum((item ->> 'amount')::numeric)
--         INTO v_item_total
--         FROM jsonb_array_elements(v_candidate.invoice_items) AS item;
--
--         IF v_item_total IS NULL OR v_item_total <> v_candidate.amount_due THEN
--             RAISE EXCEPTION 'Invoice generation candidate % item total % does not equal amount due %',
--                 p_candidate_id, v_item_total, v_candidate.amount_due;
--         END IF;
--
--         UPDATE public.invoice_generation_candidates
--         SET status = 'processing', updated_at = now()
--         WHERE id = v_candidate.id;
--
--         v_invoice_number := format(
--             'INV-%s-%s-%s-%s',
--             to_char(v_candidate.period_start, 'YYYYMM'),
--             COALESCE(upper(substr(replace(v_candidate.house_id::text, '-', ''), 1, 8)), 'NOHOUSE'),
--             upper(substr(replace(v_candidate.resident_id::text, '-', ''), 1, 8)),
--             upper(substr(replace(v_candidate.billing_profile_version_id::text, '-', ''), 1, 8))
--         );
--
--         INSERT INTO public.invoices (
--             resident_id, house_id, billing_profile_id, billing_profile_version_id, invoice_number,
--             amount_due, amount_paid, status, due_date, period_start, period_end, created_by,
--             invoice_type, rate_snapshot
--         ) VALUES (
--             v_candidate.resident_id, v_candidate.house_id, v_candidate.billing_profile_id,
--             v_candidate.billing_profile_version_id, v_invoice_number, v_candidate.amount_due,
--             0, 'unpaid', v_candidate.due_date, v_candidate.period_start, v_candidate.period_end,
--             p_actor_id, v_candidate.invoice_type, v_candidate.rate_snapshot
--         )
--         ON CONFLICT (resident_id, house_id, billing_profile_version_id, period_start, period_end)
--             WHERE billing_profile_version_id IS NOT NULL
--             DO NOTHING
--         RETURNING id INTO v_invoice_id;
--
--         IF v_invoice_id IS NULL THEN
--             SELECT id INTO v_invoice_id
--             FROM public.invoices
--             WHERE resident_id = v_candidate.resident_id
--               AND house_id IS NOT DISTINCT FROM v_candidate.house_id
--               AND billing_profile_version_id = v_candidate.billing_profile_version_id
--               AND period_start = v_candidate.period_start
--               AND period_end = v_candidate.period_end;
--
--             UPDATE public.invoice_generation_candidates
--             SET status = 'skipped',
--                 invoice_id = v_invoice_id,
--                 outcome = jsonb_build_object('reason', 'invoice_already_exists'),
--                 processed_at = now(),
--                 updated_at = now()
--             WHERE id = v_candidate.id;
--
--             RETURN jsonb_build_object(
--                 'status', 'skipped',
--                 'invoice_id', v_invoice_id,
--                 'amount', v_candidate.amount_due,
--                 'wallet_allocated', 0
--             );
--         END IF;
--
--         FOR v_item IN
--             SELECT value FROM jsonb_array_elements(v_candidate.invoice_items)
--         LOOP
--             INSERT INTO public.invoice_items (invoice_id, description, amount)
--             VALUES (
--                 v_invoice_id,
--                 COALESCE(v_item ->> 'description', v_item ->> 'name'),
--                 (v_item ->> 'amount')::numeric
--             );
--         END LOOP;
--
--         IF v_candidate.wallet_allocation_requested THEN
--             v_wallet_result := public.settle_wallet_invoices(
--                 v_candidate.resident_id,
--                 ARRAY[v_invoice_id],
--                 'existing_wallet_settlement',
--                 current_date,
--                 NULL,
--                 v_candidate.house_id,
--                 0,
--                 v_candidate.amount_due,
--                 p_actor_id
--             );
--             v_wallet_allocated := COALESCE((v_wallet_result ->> 'total_allocated')::numeric, 0);
--         END IF;
--
--         UPDATE public.invoice_generation_candidates
--         SET status = 'created',
--             invoice_id = v_invoice_id,
--             wallet_allocated = v_wallet_allocated,
--             outcome = jsonb_build_object('wallet', v_wallet_result),
--             processed_at = now(),
--             updated_at = now()
--         WHERE id = v_candidate.id;
--
--         RETURN jsonb_build_object(
--             'status', 'created',
--             'invoice_id', v_invoice_id,
--             'amount', v_candidate.amount_due,
--             'wallet_allocated', v_wallet_allocated
--         );
--     EXCEPTION WHEN OTHERS THEN
--         UPDATE public.invoice_generation_candidates
--         SET status = 'failed',
--             error_message = SQLERRM,
--             processed_at = now(),
--             updated_at = now()
--         WHERE id = p_candidate_id;
--
--         RETURN jsonb_build_object(
--             'status', 'failed',
--             'invoice_id', NULL,
--             'amount', v_candidate.amount_due,
--             'wallet_allocated', 0,
--             'error', SQLERRM
--         );
--     END;
-- END;
-- $function$
--
-- COMMIT;

BEGIN;

-- 1. The rename itself.
ALTER TABLE public.profiles RENAME COLUMN role TO role_deprecated_do_not_use;

-- 2. handle_new_user(): stop naming the legacy column at all.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
            NEW.email
        ),
        NULL,       -- role_id: assigned by an administrator on approval
        'pending'   -- no access until approved
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;

-- 3. create_generated_invoice(): authorize on the permission, not the column.
CREATE OR REPLACE FUNCTION public.create_generated_invoice(p_candidate_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_candidate public.invoice_generation_candidates%ROWTYPE;
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_wallet_result JSONB := '{}'::jsonb;
    v_wallet_allocated NUMERIC(12, 2) := 0;
    v_item JSONB;
    v_item_total NUMERIC(12, 2);
BEGIN
    IF auth.uid() IS NOT NULL AND (
        auth.uid() IS DISTINCT FROM p_actor_id
        OR NOT public.has_permission('billing.create_invoice')
    ) THEN
        RAISE EXCEPTION 'Not authorised to create generated invoices';
    END IF;

    SELECT * INTO v_candidate
    FROM public.invoice_generation_candidates
    WHERE id = p_candidate_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice generation candidate % not found', p_candidate_id;
    END IF;
    IF v_candidate.status IN ('created', 'skipped', 'cancelled') THEN
        RETURN jsonb_build_object(
            'status', v_candidate.status,
            'invoice_id', v_candidate.invoice_id,
            'amount', v_candidate.amount_due,
            'wallet_allocated', v_candidate.wallet_allocated
        );
    END IF;
    IF v_candidate.status = 'failed' THEN
        RAISE EXCEPTION 'Invoice generation candidate % has failed and must be retried explicitly', p_candidate_id;
    END IF;

    BEGIN
        IF jsonb_typeof(v_candidate.invoice_items) <> 'array'
           OR jsonb_array_length(v_candidate.invoice_items) = 0 THEN
            RAISE EXCEPTION 'Invoice generation candidate % requires at least one invoice item', p_candidate_id;
        END IF;

        SELECT sum((item ->> 'amount')::numeric)
        INTO v_item_total
        FROM jsonb_array_elements(v_candidate.invoice_items) AS item;

        IF v_item_total IS NULL OR v_item_total <> v_candidate.amount_due THEN
            RAISE EXCEPTION 'Invoice generation candidate % item total % does not equal amount due %',
                p_candidate_id, v_item_total, v_candidate.amount_due;
        END IF;

        UPDATE public.invoice_generation_candidates
        SET status = 'processing', updated_at = now()
        WHERE id = v_candidate.id;

        v_invoice_number := format(
            'INV-%s-%s-%s-%s',
            to_char(v_candidate.period_start, 'YYYYMM'),
            COALESCE(upper(substr(replace(v_candidate.house_id::text, '-', ''), 1, 8)), 'NOHOUSE'),
            upper(substr(replace(v_candidate.resident_id::text, '-', ''), 1, 8)),
            upper(substr(replace(v_candidate.billing_profile_version_id::text, '-', ''), 1, 8))
        );

        INSERT INTO public.invoices (
            resident_id, house_id, billing_profile_id, billing_profile_version_id, invoice_number,
            amount_due, amount_paid, status, due_date, period_start, period_end, created_by,
            invoice_type, rate_snapshot
        ) VALUES (
            v_candidate.resident_id, v_candidate.house_id, v_candidate.billing_profile_id,
            v_candidate.billing_profile_version_id, v_invoice_number, v_candidate.amount_due,
            0, 'unpaid', v_candidate.due_date, v_candidate.period_start, v_candidate.period_end,
            p_actor_id, v_candidate.invoice_type, v_candidate.rate_snapshot
        )
        ON CONFLICT (resident_id, house_id, billing_profile_version_id, period_start, period_end)
            WHERE billing_profile_version_id IS NOT NULL
            DO NOTHING
        RETURNING id INTO v_invoice_id;

        IF v_invoice_id IS NULL THEN
            SELECT id INTO v_invoice_id
            FROM public.invoices
            WHERE resident_id = v_candidate.resident_id
              AND house_id IS NOT DISTINCT FROM v_candidate.house_id
              AND billing_profile_version_id = v_candidate.billing_profile_version_id
              AND period_start = v_candidate.period_start
              AND period_end = v_candidate.period_end;

            UPDATE public.invoice_generation_candidates
            SET status = 'skipped',
                invoice_id = v_invoice_id,
                outcome = jsonb_build_object('reason', 'invoice_already_exists'),
                processed_at = now(),
                updated_at = now()
            WHERE id = v_candidate.id;

            RETURN jsonb_build_object(
                'status', 'skipped',
                'invoice_id', v_invoice_id,
                'amount', v_candidate.amount_due,
                'wallet_allocated', 0
            );
        END IF;

        FOR v_item IN
            SELECT value FROM jsonb_array_elements(v_candidate.invoice_items)
        LOOP
            INSERT INTO public.invoice_items (invoice_id, description, amount)
            VALUES (
                v_invoice_id,
                COALESCE(v_item ->> 'description', v_item ->> 'name'),
                (v_item ->> 'amount')::numeric
            );
        END LOOP;

        IF v_candidate.wallet_allocation_requested THEN
            v_wallet_result := public.settle_wallet_invoices(
                v_candidate.resident_id,
                ARRAY[v_invoice_id],
                'existing_wallet_settlement',
                current_date,
                NULL,
                v_candidate.house_id,
                0,
                v_candidate.amount_due,
                p_actor_id
            );
            v_wallet_allocated := COALESCE((v_wallet_result ->> 'total_allocated')::numeric, 0);
        END IF;

        UPDATE public.invoice_generation_candidates
        SET status = 'created',
            invoice_id = v_invoice_id,
            wallet_allocated = v_wallet_allocated,
            outcome = jsonb_build_object('wallet', v_wallet_result),
            processed_at = now(),
            updated_at = now()
        WHERE id = v_candidate.id;

        RETURN jsonb_build_object(
            'status', 'created',
            'invoice_id', v_invoice_id,
            'amount', v_candidate.amount_due,
            'wallet_allocated', v_wallet_allocated
        );
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.invoice_generation_candidates
        SET status = 'failed',
            error_message = SQLERRM,
            processed_at = now(),
            updated_at = now()
        WHERE id = p_candidate_id;

        RETURN jsonb_build_object(
            'status', 'failed',
            'invoice_id', NULL,
            'amount', v_candidate.amount_due,
            'wallet_allocated', 0,
            'error', SQLERRM
        );
    END;
END;
$function$;

COMMIT;
