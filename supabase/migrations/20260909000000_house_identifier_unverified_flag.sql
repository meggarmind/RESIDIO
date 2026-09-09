-- Issue #119: houses recorded from the manual register with a doubted house
-- number have nowhere to flag the doubt.
--
-- The `?` inside identifiers such as `GLB-19?`, `IBB-3?F?`, `IBB-32?` and
-- `KOA-10F-?` is the manual register's own convention for "the recorder was
-- not certain of this character". It is deliberate, meaningful data, not an
-- encoding fault: the stored bytes are plain ASCII `?`.
--
-- The owner's decision (2026-09-09) is that the recorded identifier is NOT
-- rewritten -- `3?F?` stays `3?F?`, because live payments already reference
-- these rows -- and the doubt instead becomes an explicit, queryable field
-- beside it. Deriving the flag from the presence of `?` was considered and
-- rejected: it carries no note, is undocumented in the data, and breaks the
-- moment someone doubts an identifier that contains no `?` at all.
--
-- The one-off backfill below seeds the flag from the `?` convention. That is a
-- migration of historical data, not a derivation rule -- from here on the flag
-- is set and cleared by admins through the houses UI.
--
-- QA follow-up (#119 D2): confirming an identifier never rewrites it (see
-- above), so a confirmed row's normal end state is `identifier_unverified =
-- false` with the `?` still sitting in `house_number` / `short_name`. A
-- WHERE ... AND identifier_unverified = false guard does not protect that --
-- it is exactly the state of a row someone already cleared, so re-running the
-- backfill would silently refill the queue with work already done.
--
-- The backfill is therefore gated on whether `identifier_unverified` was
-- newly added by *this* migration, captured with information_schema before
-- the ALTER runs. On the first run the column does not exist yet, the flag
-- is true, and the backfill seeds the four known rows. On any re-run the
-- column already exists, the flag is false, and the UPDATE is skipped
-- entirely -- a confirmed row stays confirmed no matter how many times this
-- file is applied.

BEGIN;

DO $$
DECLARE
  column_is_new boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'houses'
      AND column_name = 'identifier_unverified'
  ) INTO column_is_new;

  ALTER TABLE public.houses
    ADD COLUMN IF NOT EXISTS identifier_unverified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS identifier_note text;

  IF column_is_new THEN
    -- One-off backfill of the register's `?` convention, run only on the
    -- migration that introduces the column. `?` is not a LIKE wildcard in
    -- Postgres, so these patterns match a literal question mark.
    UPDATE public.houses
    SET
      identifier_unverified = true,
      identifier_note = COALESCE(
        identifier_note,
        'Recorded from the manual register with a doubted character (?) in the identifier. Awaiting site confirmation.'
      )
    WHERE (house_number LIKE '%?%' OR short_name LIKE '%?%');
  END IF;
END $$;

COMMENT ON COLUMN public.houses.identifier_unverified IS
  'True when the recorded house identifier is doubted and awaiting confirmation. Set/cleared by admins holding houses.update; never derived from the identifier string at read time (issue #119).';

COMMENT ON COLUMN public.houses.identifier_note IS
  'Free-text context for a doubted identifier -- what is uncertain and what would settle it (issue #119).';

-- Partial index: the remediation queue only ever reads the flagged rows, which
-- are a handful out of the whole register.
CREATE INDEX IF NOT EXISTS idx_houses_identifier_unverified
  ON public.houses (identifier_unverified)
  WHERE identifier_unverified;

COMMIT;
