
-- AI Conversation Logs table: audit trail for AI chat sessions
CREATE TABLE IF NOT EXISTS public.ai_conversation_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_role text NOT NULL DEFAULT 'resident'
        CHECK (user_role IN ('admin', 'resident', 'chairman', 'financial_secretary', 'security_officer')),
    message_count integer NOT NULL DEFAULT 0,
    first_message text,  -- first user message (acts as topic indicator)
    full_transcript jsonb DEFAULT '[]'::jsonb,  -- full message history for audit
    provider text,
    model_name text,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS ai_conversation_logs_user_id_idx ON public.ai_conversation_logs(user_id);
CREATE INDEX IF NOT EXISTS ai_conversation_logs_created_at_idx ON public.ai_conversation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversation_logs_user_role_idx ON public.ai_conversation_logs(user_role);

-- RLS
ALTER TABLE public.ai_conversation_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read ALL conversation logs (for audit/support/research)
CREATE POLICY "Admins can read all conversation logs"
    ON public.ai_conversation_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('chairman', 'financial_secretary', 'admin')
        )
    );

-- All authenticated users can insert their own logs
CREATE POLICY "Users can insert their own conversation logs"
    ON public.ai_conversation_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can read their own logs only
CREATE POLICY "Users can read their own conversation logs"
    ON public.ai_conversation_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
