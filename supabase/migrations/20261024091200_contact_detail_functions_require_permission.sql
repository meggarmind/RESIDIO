-- Issue #992: three SECURITY DEFINER functions that return personal contact details now refuse
-- callers that lack the permission of the screen that uses them. Until now they did not check the
-- caller beyond the EXECUTE grant to every signed-in account.
--
-- Callers (src/ and the live Stage database, checked 2026-10-21):
--   get_frequent_visitors       <- getFrequentVisitors (src/actions/security/visitor-analytics.ts),
--                                  which checks security.view_logs; Visitor analytics panel on /security.
--   get_visitor_history_summary <- getVisitorHistorySummary (same file), which checks
--                                  security.view_logs; Visit history card on /security/contacts/[id].
--   get_primary_occupier        <- no caller in src/, in any database function or in any view.
--
-- Rules after this migration:
--   get_frequent_visitors, get_visitor_history_summary: has_permission('security.view_logs'), the
--     permission the server actions already check, so no screen changes. has_permission() is
--     false for anon, for an account that is not approved, and for a role without the permission.
--   get_primary_occupier: server code only (service_role). EXECUTE is revoked from authenticated,
--     and the body refuses every other caller, so a later GRANT does not reopen it.
-- The bodies are otherwise unchanged. A refused call raises SQLSTATE 42501.
-- EXECUTE from PUBLIC and anon is revoked again: 20260824202000 already did this; repeating it
-- keeps this file correct on its own.
--
-- Idempotent: CREATE OR REPLACE keeps each function's owner and grants; REVOKE and GRANT repeat
-- safely.
--
-- Rollback (restores the unguarded bodies and the authenticated grant on get_primary_occupier):
--   GRANT EXECUTE ON FUNCTION public.get_primary_occupier(uuid) TO authenticated;
--   then re-run each CREATE OR REPLACE FUNCTION below without its "IF ... RAISE ... END IF;"
--   guard block (the lines between BEGIN and RETURN QUERY). Every other line is the previous
--   definition, as in supabase/baseline/00000000000000_baseline.sql.

CREATE OR REPLACE FUNCTION public.get_frequent_visitors(p_min_visits integer DEFAULT 5, p_days integer DEFAULT 30, p_limit integer DEFAULT 20)
 RETURNS TABLE(contact_id uuid, full_name text, phone_primary text, photo_url text, category_name text, resident_name text, resident_code text, visit_count bigint, last_visit_at timestamp with time zone, avg_duration_minutes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_permission('security.view_logs') THEN
    RAISE EXCEPTION 'Permission denied: security.view_logs is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sc.id AS contact_id,
    sc.full_name,
    sc.phone_primary,
    sc.photo_url,
    cat.name AS category_name,
    (r.first_name || ' ' || r.last_name) AS resident_name,
    r.resident_code,
    COUNT(al.id) AS visit_count,
    MAX(al.check_in_time) AS last_visit_at,
    AVG(
      CASE WHEN al.check_out_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (al.check_out_time - al.check_in_time)) / 60
        ELSE NULL
      END
    )::INTEGER AS avg_duration_minutes
  FROM security_contacts sc
  JOIN access_logs al ON al.contact_id = sc.id
  LEFT JOIN security_contact_categories cat ON cat.id = sc.category_id
  LEFT JOIN residents r ON r.id = sc.resident_id
  WHERE
    sc.status = 'active'
    AND al.check_in_time >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sc.id, sc.full_name, sc.phone_primary, sc.photo_url, cat.name, r.first_name, r.last_name, r.resident_code
  HAVING COUNT(al.id) >= p_min_visits
  ORDER BY visit_count DESC, last_visit_at DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_visitor_history_summary(p_contact_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(total_visits bigint, first_visit timestamp with time zone, last_visit timestamp with time zone, avg_duration_minutes integer, total_duration_hours numeric, most_common_gate text, flagged_visits bigint, vehicles_used bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_permission('security.view_logs') THEN
    RAISE EXCEPTION 'Permission denied: security.view_logs is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(al.id) AS total_visits,
    MIN(al.check_in_time) AS first_visit,
    MAX(al.check_in_time) AS last_visit,
    AVG(al.actual_duration_minutes)::INTEGER AS avg_duration_minutes,
    ROUND(SUM(COALESCE(al.actual_duration_minutes, 0)) / 60.0, 2) AS total_duration_hours,
    (
      SELECT al2.gate_location
      FROM access_logs al2
      WHERE al2.contact_id = p_contact_id
      AND al2.gate_location IS NOT NULL
      GROUP BY al2.gate_location
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_gate,
    SUM(CASE WHEN al.flagged THEN 1 ELSE 0 END) AS flagged_visits,
    COUNT(DISTINCT al.vehicle_id) AS vehicles_used
  FROM access_logs al
  WHERE
    al.contact_id = p_contact_id
    AND al.check_in_time >= NOW() - (p_days || ' days')::INTERVAL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_primary_occupier(p_house_id uuid)
 RETURNS TABLE(resident_id uuid, first_name text, last_name text, email text, phone_primary text, resident_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Permission denied: get_primary_occupier is for server use only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.first_name,
    r.last_name,
    r.email,
    r.phone_primary,
    rh.resident_role::TEXT
  FROM resident_houses rh
  JOIN residents r ON rh.resident_id = r.id
  WHERE rh.house_id = p_house_id
  AND rh.is_active = true
  AND rh.resident_role IN ('resident_landlord', 'tenant')
  ORDER BY
    CASE rh.resident_role
      WHEN 'resident_landlord' THEN 1
      WHEN 'tenant' THEN 2
    END
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_frequent_visitors(integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_visitor_history_summary(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_primary_occupier(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_frequent_visitors(integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_visitor_history_summary(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_primary_occupier(uuid) TO service_role;
