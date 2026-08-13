-- Keep the privileged invoice-generation RPC inaccessible to anonymous callers.
REVOKE ALL ON FUNCTION public.create_generated_invoice(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_generated_invoice(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_generated_invoice(UUID, UUID) TO authenticated, service_role;
