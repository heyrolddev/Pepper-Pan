-- ============================================================
-- Promos and news the shop can change itself
--
-- The homepage's promo strip has been five hardcoded strings since the day it
-- was written — "Free Coffee Dine-In", "Giant Ji Pai" — and changing one
-- meant a code change and a deploy. For a stall whose promos last a fortnight
-- that is not a workflow, it is a reason not to run promos.
--
-- `settings.promo_tags` has existed since the first migration and nothing has
-- ever read or written it. It is a bare text[], with nowhere to put a date, a
-- description, or an order. Left alone rather than pressed into service:
-- a promo that cannot expire is the whole problem this table exists to solve.
-- ============================================================

create table if not exists announcements (
  id bigserial primary key,

  /* Two shapes, one table, because they differ by presentation and not by
     substance: both are a line of text the shop wants on its homepage, with
     a window it applies in.

       promo — short and loud. "Free coffee when you dine in." Goes in the
               strip that scrolls across the homepage, and on a card.
       news  — dated and informational. "Closed 5 Sept for a private event."
               Goes in a list, newest first. */
  kind text not null check (kind in ('promo', 'news')),

  title text not null,
  /* Optional. A promo often needs no more than its title; a news post
     usually does. */
  body text,

  /* When it applies. Both null means "now, until somebody says otherwise",
     which is the common case and so it is the default.

     Scheduling is the point of this table. A promo that has to be switched
     off by hand is a promo that stays up: the free coffee ended on Sunday,
     nobody remembered on Monday, and on Tuesday a customer arrives expecting
     it. That is worse than never having run it — the shop now has to either
     honour a promo it is losing money on or argue with somebody holding a
     screenshot of its own homepage. */
  starts_at timestamptz,
  ends_at timestamptz,

  /* Off without deleting. A promo that ran last Christmas is worth keeping to
     run again next Christmas. */
  is_active boolean not null default true,

  /* Which promo leads. Ties break on newest, so an unordered list is stable. */
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_announcements_live
  on announcements (kind, is_active, sort_order);

alter table announcements enable row level security;

-- ============================================================
-- Table privileges, said out loud
--
-- Supabase grants every new public table to `anon` and `authenticated` by
-- default, which would leave a customer's browser session holding INSERT and
-- DELETE on the shop's homepage copy — restrained only by the row policy
-- below. The policy does restrain it. But a table nobody can write is a
-- stronger statement than a table anybody can write and a policy says no to,
-- and this way the migration means the same thing wherever it is run instead
-- of inheriting whatever the defaults happen to be.
--
-- The app writes through the service role, which is unaffected by any of this.
-- `authenticated` keeps the write grants so the manager policy is a real path
-- rather than a comment describing one.
-- ============================================================
revoke all on announcements from anon, authenticated;
grant select on announcements to anon, authenticated;
grant insert, update, delete on announcements to authenticated;
grant usage, select on sequence announcements_id_seq to authenticated;

-- ============================================================
-- Who can see what
--
-- The public read is deliberately narrow: it returns only what is LIVE right
-- now. A promo drafted for next month is not merely hidden by the homepage —
-- it cannot be read at all from a browser session, so it does not leak from
-- the REST endpoint before it launches. A shop's next campaign is not
-- something its competitor should be able to fetch a week early.
--
-- `now()` inside a policy is evaluated per query, so the window is enforced
-- at read time rather than at write time. Nothing has to run on a schedule
-- for an expired promo to stop being visible.
-- ============================================================
drop policy if exists "public_read_live_announcements" on announcements;
create policy "public_read_live_announcements" on announcements
  for select using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

/* Everyone who runs the shop sees all of them, live or not — you cannot edit
   a draft you cannot read. */
drop policy if exists "manager_read_all_announcements" on announcements;
create policy "manager_read_all_announcements" on announcements
  for select using (is_manager());

/* Written by manager and owner. A promo is the shop talking to its customers
   in public, which is a step above a shift's business — but it is also the
   kind of thing that has to go up on the day somebody decides it, and a
   manager running a service is exactly who decides it. */
drop policy if exists "manager_write_announcements" on announcements;
create policy "manager_write_announcements" on announcements
  for all using (is_manager()) with check (is_manager());

-- ============================================================
-- `updated_at` that is actually true
--
-- Set by the database rather than by whichever screen happens to be saving,
-- because a timestamp only one code path remembers to write is a timestamp
-- that lies the first time a second code path appears.
-- ============================================================
create or replace function touch_announcement()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_announcement on announcements;
create trigger touch_announcement
  before update on announcements
  for each row execute function touch_announcement();

-- ============================================================
-- The strip starts with what the homepage already said
--
-- Those five lines are the shop's own copy, written for that space. Seeding
-- them means the homepage looks identical the moment this ships, and the
-- owner edits real promos rather than facing an empty screen and a blank box.
-- ============================================================
insert into announcements (kind, title, sort_order)
select 'promo', v.title, v.n
from (values
  ('Black Pepper Noodles', 10),
  ('Made Fresh Daily', 20),
  ('Free Coffee Dine-In', 30),
  ('Giant Ji Pai', 40),
  ('Taiwan Milktea', 50)
) as v(title, n)
-- Guarded, so re-running never doubles the strip.
where not exists (select 1 from announcements where kind = 'promo');
