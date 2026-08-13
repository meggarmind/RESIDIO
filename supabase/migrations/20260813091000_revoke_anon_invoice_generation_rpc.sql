-- Correct the original RPC grant: a SECURITY DEFINER invoice writer must
-- never be executable by unauthenticated Data API callers.
REVOKE ALL ON FUNCTION public.create_generated_invoice(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_generated_invoice(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_generated_invoice(uuid, uuid) TO authenticated, service_role;
