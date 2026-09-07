-- ============================================================
-- Telling an automatic safety copy apart from one somebody asked for.
--
-- `restore_snapshots` already holds the copy the restore screen takes before
-- it writes anything. That copy exists because the owner was being asked to
-- remember something at the worst possible moment. The same argument applies
-- to backups in general — they were manual, so the shop's records were only
-- ever as safe as the last time somebody remembered to press Download.
--
-- The snapshots are about to start being taken on a schedule, and the two
-- kinds need different retention. A pre-restore copy is only interesting for
-- a few days: it exists in case that one restore was a mistake. A daily copy
-- is interesting for as long as it takes to notice something went wrong last
-- week, which is longer. One `KEEP` for both families would either throw away
-- the daily history or hoard pre-restore copies nobody will read.
--
-- Worth being plain about what this is NOT. A copy in the same database as
-- the thing it protects covers a bad restore, a wrong reset and a botched
-- import. It does not cover losing the database itself. The download is still
-- the off-site copy, which is why the backup screen now nags about it instead
-- of hoping.
-- ============================================================

alter table restore_snapshots add column if not exists automatic boolean not null default false;

comment on column restore_snapshots.automatic is
  'True when the system took this on its own schedule rather than a person or a restore asking for it. The two families are trimmed separately.';

-- Trimming reads the newest-first list per family, so it wants both columns.
create index if not exists idx_restore_snapshots_family
  on restore_snapshots(automatic, taken_at desc);
