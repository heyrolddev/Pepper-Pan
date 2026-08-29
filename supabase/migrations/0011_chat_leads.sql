-- Pepper Pan — "Ask Pepper Pan" conversations and leads
-- Run this once in the Supabase SQL Editor, after 0010.
--
-- Every conversation with the assistant is kept so the shop can read what
-- people are asking, spot a real customer who needs a human, and see which
-- questions come up often enough to belong on the menu page instead.

create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  -- Anonymous visitors get a random browser-held key; that's how a signed-out
  -- person keeps their own thread without us knowing who they are.
  guest_key text,
  channel text not null default 'web' check (channel in ('web', 'messenger')),
  -- Messenger's page-scoped sender id, when the thread came from Facebook.
  external_id text,
  contact_name text,
  contact_phone text,
  -- Raised when the assistant decides a human should take over.
  needs_human boolean not null default false,
  handled boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id bigserial primary key,
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread on chat_messages(thread_id, id);
create index if not exists idx_chat_threads_recent on chat_threads(last_message_at desc);
create unique index if not exists idx_chat_threads_guest
  on chat_threads(guest_key) where guest_key is not null;
create unique index if not exists idx_chat_threads_external
  on chat_threads(external_id) where external_id is not null;

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

-- ============================================================
-- Only staff read the inbox.
--
-- A signed-in customer can see their own thread; anonymous threads are keyed
-- by a secret the browser holds, and are written through the server action
-- with the service role rather than read directly by the browser — so there
-- is deliberately no public SELECT policy to enumerate them through.
-- ============================================================
drop policy if exists "staff_read_threads" on chat_threads;
create policy "staff_read_threads" on chat_threads for select
  using (is_staff() or (customer_id is not null and customer_id = auth.uid()));

drop policy if exists "staff_update_threads" on chat_threads;
create policy "staff_update_threads" on chat_threads for update
  using (is_staff()) with check (is_staff());

drop policy if exists "staff_read_messages" on chat_messages;
create policy "staff_read_messages" on chat_messages for select
  using (
    is_staff()
    or exists (
      select 1 from chat_threads t
      where t.id = chat_messages.thread_id
        and t.customer_id is not null
        and t.customer_id = auth.uid()
    )
  );

-- ============================================================
-- CHAT SETTINGS — one row, owned by the shop.
--
-- The Messenger link is shown to a visitor the assistant can't help, so they
-- always have a way through to a person. The notify address is where a new
-- lead is announced; leaving it blank just means the shop watches the inbox.
-- ============================================================
create table if not exists chat_settings (
  id smallint primary key default 1 check (id = 1),
  -- e.g. https://m.me/pepperpan — shown as "Chat on Messenger".
  messenger_url text,
  -- Facebook Page id this shop answers as, once the Meta app is connected.
  page_id text,
  updated_at timestamptz not null default now()
);

insert into chat_settings (id) values (1) on conflict (id) do nothing;

alter table chat_settings enable row level security;

-- The Messenger link is public by design — it's a "message us" button.
drop policy if exists "public_read_chat_settings" on chat_settings;
create policy "public_read_chat_settings" on chat_settings for select using (true);

drop policy if exists "staff_write_chat_settings" on chat_settings;
create policy "staff_write_chat_settings" on chat_settings for update
  using (is_staff()) with check (is_staff());

-- When staff cleared a thread, so the inbox can show "handled 2h ago".
alter table chat_threads add column if not exists handled_at timestamptz;
