CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, role_id, approval_status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
            NEW.email
        ),
        NULL,       -- legacy role: deprecated, never trusted
        NULL,       -- role_id: assigned by an administrator on approval
        'pending'   -- no access until approved
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$
