
-- AI Settings table: stores LLM provider configuration
CREATE TABLE IF NOT EXISTS public.ai_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL DEFAULT 'ollama'
        CHECK (provider IN ('ollama', 'openai', 'anthropic', 'gemini', 'groq')),
    model_name text NOT NULL DEFAULT 'mistral',
    endpoint_url text NOT NULL DEFAULT 'http://localhost:11434',
    api_key text DEFAULT NULL,
    temperature numeric(3,2) NOT NULL DEFAULT 0.7
        CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens integer NOT NULL DEFAULT 2048
        CHECK (max_tokens > 0 AND max_tokens <= 32768),
    system_prompt text NOT NULL DEFAULT 'You are a helpful estate management assistant. You help admins and residents with estate-related questions. Always be polite, concise, and factual. Never disclose information about other residents to unauthorized users.',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active configuration at a time
CREATE UNIQUE INDEX IF NOT EXISTS ai_settings_single_active_idx
    ON public.ai_settings (is_active)
    WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_ai_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_ai_settings_updated_at ON public.ai_settings;
CREATE TRIGGER update_ai_settings_updated_at
    BEFORE UPDATE ON public.ai_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_ai_settings_updated_at();

-- RLS: admin roles only (chairman, financial_secretary, admin)
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage AI settings"
    ON public.ai_settings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('chairman', 'financial_secretary', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('chairman', 'financial_secretary', 'admin')
        )
    );

-- All authenticated users can read the active AI settings (needed for chat)
CREATE POLICY "All users can read active AI settings"
    ON public.ai_settings
    FOR SELECT
    TO authenticated
    USING (is_active = true);

-- Seed default Ollama/Mistral configuration
INSERT INTO public.ai_settings (
    provider, model_name, endpoint_url, temperature, max_tokens, system_prompt, is_active
) VALUES (
    'ollama',
    'mistral',
    'http://localhost:11434',
    0.7,
    2048,
    'You are the Estate Assistant for this residential estate. You help admins and residents with estate-related questions including billing, payments, announcements, security, and general estate information. Always be polite, concise, and factual. For admin users, you can provide estate-wide information. For residents, only provide information relevant to their own property and account. Never disclose personal information about other residents.',
    true
)
ON CONFLICT DO NOTHING;
