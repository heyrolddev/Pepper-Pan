-- ============================================================
-- Getting back in.
--
-- Read the case that matches before running anything. Most of them do not
-- need this file at all, and running SQL you did not need is how a bad day
-- gets worse.
--
-- CASE 1 — The owner forgot their password.
--   Nothing here. Sign-in page → "Forgot password" → the reset arrives at
--   the account's email. This is the ordinary case and it needs no help.
--
-- CASE 2 — The owner's phone was stolen or lost.
--   Nothing here either, and this is worth saying plainly: HQ is a website,
--   not an app on that phone, and the owner is deliberately NOT device-gated.
--   Sign in on any other phone or laptop and everything is there.
--
--   What the thief has is a browser that may still be signed in. Deal with
--   that, in this order:
--     1. Change the password (Account → or the reset link above). Supabase
--        ends every other session when the password changes.
--     2. HQ → Staff → Devices → Remove anything you do not recognise.
--     3. If 2FA for Supabase or GitHub lived on that phone, use the recovery
--        codes you saved when turning it on. This is what they are for.
--
-- CASE 3 — Somebody else has the owner account and you cannot sign in.
--   You need another way to reach the database. Use CASE 4 from a second
--   owner account, or the Supabase dashboard below.
--
-- CASE 4 — You still have the Supabase dashboard, but no owner account.
--   The query below. This is the break-glass: it works when nothing in the
--   app works, because it goes underneath the app entirely.
--
-- CASE 5 — Supabase itself is gone.
--   The backup file. A new Supabase project, migrations 0001 onward in the
--   SQL Editor, then HQ → Backup → restore. This is why the first of the
--   month matters, and why the file lives somewhere that is not this laptop.
--
-- THE REAL ANSWER, which is none of the above: have a second owner. Two
-- owners can always restore each other with no dashboard, no SQL and no
-- waiting. HQ → Staff → offer somebody the owner role. Do it before you
-- need it; nobody has ever set this up during the emergency.
-- ============================================================


-- ------------------------------------------------------------
-- Who are the owners right now?
-- Run this first. If a name you trust is here, use that account instead of
-- anything below.
-- ------------------------------------------------------------
select p.id, p.full_name, p.role, u.email, u.last_sign_in_at
from profiles p
join auth.users u on u.id = p.id
where p.role = 'owner';


-- ------------------------------------------------------------
-- CASE 4 — Make an existing account the owner.
--
-- The account must already exist: they sign up on the website like any
-- customer first, then this promotes them. Change the email, then run.
--
-- This writes `role` directly and skips the offer-and-accept step, which is
-- correct here — there is nobody able to send an offer, which is the whole
-- reason you are reading this file.
-- ------------------------------------------------------------
-- update profiles
-- set role = 'owner', pending_role = null, role_offered_at = null
-- where id = (select id from auth.users where email = 'the-new-owner@example.com');


-- ------------------------------------------------------------
-- Lock out a compromised account.
--
-- Drops it to customer and closes any shift it left open. It does NOT change
-- their password — do that from the Supabase dashboard under Authentication
-- → Users, which also ends their sessions.
-- ------------------------------------------------------------
-- update profiles
-- set role = 'customer', pending_role = null
-- where id = (select id from auth.users where email = 'the-compromised@example.com');

-- update staff_shifts
-- set ended_at = now(), note = 'Closed — access removed'
-- where staff_id = (select id from auth.users where email = 'the-compromised@example.com')
--   and ended_at is null;


-- ------------------------------------------------------------
-- Clear every remembered device for one person.
--
-- Their next sign-in becomes a first sign-in, which is approved on sight —
-- so this is the way back for somebody whose only approved device is gone
-- and who cannot wait for an owner to allow the new one.
-- ------------------------------------------------------------
-- delete from device_sessions
-- where user_id = (select id from auth.users where email = 'them@example.com');
