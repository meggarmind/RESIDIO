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

BEGIN;

ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS identifier_unverified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identifier_note text;

COMMENT ON COLUMN public.houses.identifier_unverified IS
  'True when the recorded house identifier is doubted and awaiting confirmation. Set/cleared by admins holding houses.update; never derived from the identifier string at read time (issue #119).';

COMMENT ON COLUMN public.houses.identifier_note IS
  'Free-text context for a doubted identifier -- what is uncertain and what would settle it (issue #119).';

-- One-off backfill of the register's `?` convention. `?` is not a LIKE
-- wildcard in Postgres, so these patterns match a literal question mark.
UPDATE public.houses
SET
  identifier_unverified = true,
  identifier_note = COALESCE(
    identifier_note,
    'Recorded from the manual register with a doubted character (?) in the identifier. Awaiting site confirmation.'
  )
WHERE
  (house_number LIKE '%?%' OR short_name LIKE '%?%')
  AND identifier_unverified = false;

-- Partial index: the remediation queue only ever reads the flagged rows, which
-- are a handful out of the whole register.
CREATE INDEX IF NOT EXISTS idx_houses_identifier_unverified
  ON public.houses (identifier_unverified)
  WHERE identifier_unverified;

COMMIT;
