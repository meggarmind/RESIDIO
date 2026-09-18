-- 1. Drop existing foreign key
ALTER TABLE in_app_notifications 
DROP CONSTRAINT IF EXISTS in_app_notifications_recipient_id_fkey;

-- 2. Add new foreign key pointing to profiles(id)
ALTER TABLE in_app_notifications
ADD CONSTRAINT in_app_notifications_recipient_id_fkey 
FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. Update RLS policies
-- Drop old policies
DROP POLICY IF EXISTS in_app_notifications_own_select ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_own_update ON in_app_notifications;
DROP POLICY IF EXISTS in_app_notifications_own_delete ON in_app_notifications;

-- Create new policies based on profile_id (auth.uid())
CREATE POLICY in_app_notifications_own_select ON in_app_notifications
    FOR SELECT TO authenticated
    USING (recipient_id = auth.uid());

CREATE POLICY in_app_notifications_own_update ON in_app_notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

CREATE POLICY in_app_notifications_own_delete ON in_app_notifications
    FOR DELETE TO authenticated
    USING (recipient_id = auth.uid());
