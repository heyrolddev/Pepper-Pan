-- ============================================================
-- The copy that leaves the building.
--
-- 0037 made the shop copy itself every day, which closed the gap where a
-- backup only existed if somebody remembered to press Download. It did not
-- close the other one: those copies live inside the database they protect.
-- They undo a bad restore, a wrong reset or a botched import. They cannot
-- survive losing the project.
--
-- So, once a week, the whole snapshot is emailed to an address the owner
-- names. Email because this shop already sends it — Resend is configured for
-- order updates — so it costs nothing new and needs no second account.
--
-- Off by default, and the address is stored rather than assumed. That is
-- deliberate: this file is every customer's name, phone and address, and
-- sending it anywhere is the owner's decision to make explicitly, not
-- something that starts happening because a migration ran.
-- ============================================================

alter table settings add column if not exists offsite_backup_enabled boolean not null default false;
alter table settings add column if not exists offsite_backup_email text;
alter table settings add column if not exists offsite_backup_last_at timestamptz;
alter table settings add column if not exists offsite_backup_last_error text;

comment on column settings.offsite_backup_enabled is
  'Whether the weekly copy is emailed out. Off until the owner turns it on, because the file is every customer''s details.';
comment on column settings.offsite_backup_email is
  'Where the weekly copy goes. Stored rather than taken from the account, so it can be an address kept apart from the one used to sign in.';
comment on column settings.offsite_backup_last_at is
  'When one was last sent. What the weekly schedule is measured from.';
comment on column settings.offsite_backup_last_error is
  'Why the last attempt failed, or null. A backup that quietly stopped working is worse than one that never started.';
