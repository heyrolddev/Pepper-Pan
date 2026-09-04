-- ============================================================
-- 0029 — A role offer may be 'owner'
--
-- 0028 allowed only 'manager' and 'staff' in `pending_role`, which was the
-- right conservative first move and the wrong answer to the question that
-- came next: what happens if the owner loses their phone, forgets their
-- password, or somebody takes the account.
--
-- With exactly one owner, every answer to that runs through the Supabase
-- dashboard — and if that is lost too, there is no answer. A second owner is
-- the only recovery plan that needs nobody's help: two owners can always
-- restore each other, with no dashboard and no SQL.
--
-- This is a separate file rather than an edit to 0028 because 0028 has
-- already been run. Editing an applied migration changes nothing in the
-- database and makes the file lie about what the database contains — the
-- next person to rebuild from these files would get something different from
-- what is actually live, with no warning.
--
-- Safe to run twice: the constraint is dropped by name first, and dropping
-- one that is not there is not an error.
-- ============================================================

alter table profiles drop constraint if exists profiles_pending_role_check;

alter table profiles add constraint profiles_pending_role_check
  check (pending_role is null or pending_role in ('owner', 'manager', 'staff'));
