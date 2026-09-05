-- ============================================================
-- 0031 — A copy taken automatically, just before anything is overwritten
--
-- The restore screen tells the owner to download a backup first. Telling is
-- not the same as doing, and the one time it matters is the time somebody is
-- in a hurry because something has already gone wrong. A safety net that
-- depends on remembering is not a safety net.
--
-- So the restore takes its own copy before it writes a single row, and puts
-- it here. Nothing to remember, nothing to click.
--
-- WHY A TABLE AND NOT THE STORAGE BUCKET
--
-- The obvious home is `storage.objects`, and it is the wrong one: this
-- project's only bucket is public, because it serves the menu photographs. A
-- full backup contains every customer's name, phone number and delivery
-- address, and putting that behind a guessable URL would be a far worse
-- failure than the one this is protecting against. A private bucket would
-- work, but a table is protected by the same row-level security as everything
-- else here — one mechanism instead of two — and half a megabyte of JSON is
-- nothing to Postgres, which compresses it out of line automatically.
--
-- Deliberately NOT in the backup's own table list: a backup containing its
-- own previous copies doubles in size every time one is taken.
-- ============================================================

create table if not exists restore_snapshots (
  id text primary key default gen_random_uuid()::text,
  taken_at timestamptz not null default now(),
  -- What was about to happen. Written in the words the owner will read a week
  -- later, not in a code.
  reason text not null,
  -- Row count and byte size, so the list can be shown without reading half a
  -- megabyte of JSON per row to find out how big it is.
  rows_included int not null default 0,
  bytes int not null default 0,
  payload text not null
);

create index if not exists idx_restore_snapshots_taken
  on restore_snapshots(taken_at desc);

alter table restore_snapshots enable row level security;

-- The owner alone. These rows are a complete copy of the business, so the
-- rule that guards them has to be at least as strict as the rule guarding
-- the tables they came from — and `settings` is the owner's alone.
drop policy if exists "owner_manage_restore_snapshots" on restore_snapshots;
create policy "owner_manage_restore_snapshots" on restore_snapshots
  for all using (is_owner()) with check (is_owner());
