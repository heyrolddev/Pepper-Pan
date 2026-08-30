-- Pepper Pan — the owner answers back, and teaches the assistant
-- Run this once in the Supabase SQL Editor, after 0011.
--
-- Two things the shop asked for:
--   1. Take over a chat and reply as the shop, from HQ.
--   2. Add or correct an answer, so a question the assistant fumbled once is
--      answered properly forever after.

-- ============================================================
-- STAFF REPLIES
--
-- A third voice in the transcript. The check constraint has to be replaced
-- rather than added to, since 'staff' wasn't in the original set.
-- ============================================================
alter table chat_messages drop constraint if exists chat_messages_role_check;
alter table chat_messages add constraint chat_messages_role_check
  check (role in ('user', 'assistant', 'staff'));

-- Once the owner joins a conversation the automatic replies stand down for
-- that thread. Nothing is worse than a bot talking over the owner mid-sentence.
alter table chat_threads add column if not exists taken_over boolean not null default false;
alter table chat_threads add column if not exists taken_over_at timestamptz;

-- Staff write replies through their own session, so RLS is the guard.
drop policy if exists "staff_write_messages" on chat_messages;
create policy "staff_write_messages" on chat_messages for insert
  with check (is_staff() and role = 'staff');

-- ============================================================
-- OWNER FAQ
--
-- The assistant answers from the shop's data, which covers prices, delivery
-- and hours — but not "may parking ba kayo?" or "pwede bang walang sibuyas?".
-- This is where the owner writes those answers themselves, once.
--
-- `triggers` holds the words that should reach this answer. Matching is done
-- in the application (word-start, same rule as the built-in intents) rather
-- than in SQL, so the owner never has to think about pattern syntax.
-- ============================================================
create table if not exists faq_entries (
  id uuid primary key default gen_random_uuid(),
  -- What the owner is answering, in their words — shown in HQ, never to a customer.
  question text not null,
  -- The reply the customer sees, exactly as typed.
  answer text not null,
  -- Words or short phrases that should reach this answer.
  triggers text[] not null default '{}',
  is_active boolean not null default true,
  -- How often it has actually answered someone, so dead entries are visible.
  hits integer not null default 0,
  -- Higher wins when two entries match the same message.
  priority smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_faq_active on faq_entries(is_active, priority desc);

alter table faq_entries enable row level security;

-- The assistant reads these to answer the public, so they are public by
-- nature — the owner writes them expecting customers to see them.
drop policy if exists "public_read_faq" on faq_entries;
create policy "public_read_faq" on faq_entries for select using (is_active or is_staff());

drop policy if exists "staff_insert_faq" on faq_entries;
create policy "staff_insert_faq" on faq_entries for insert with check (is_staff());

drop policy if exists "staff_update_faq" on faq_entries;
create policy "staff_update_faq" on faq_entries for update
  using (is_staff()) with check (is_staff());

drop policy if exists "staff_delete_faq" on faq_entries;
create policy "staff_delete_faq" on faq_entries for delete using (is_staff());

-- Counting a hit must not require the caller to be able to UPDATE the row —
-- a signed-out visitor asking a question is what triggers it.
create or replace function bump_faq_hit(p_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update faq_entries set hits = hits + 1 where id = p_id;
$$;

-- ============================================================
-- REALTIME — so the shop's inbox updates as customers type.
-- ============================================================
alter table chat_messages replica identity full;
alter table chat_threads replica identity full;

do $$
begin
  alter publication supabase_realtime add table chat_messages;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table chat_threads;
exception
  when duplicate_object then null;
end
$$;
