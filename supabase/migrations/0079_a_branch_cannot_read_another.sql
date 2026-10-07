/*
 * The wall between two branches, in the database.
 *
 * 0078 gave an order a branch and a person a branch. This makes the database
 * refuse a pinned member of staff who reaches for another branch's rows.
 *
 * ── Why this is defence and not the gate ─────────────────────────────────
 *
 * HQ reads almost everything with the service role, which bypasses row-level
 * security by design — that is how a back office sees figures a browser
 * session may not. So the REAL branch wall for HQ is the application: every
 * scoped query filters by branch itself, and a query that forgets to is a
 * blended figure no policy here will catch.
 *
 * What this does catch is the other half: anything reaching the database
 * through a signed-in browser session. The order board's status changes, the
 * ETA, the payment marks and the customer's own edits all go that way. A
 * pinned cashier at El Mercado with the developer tools open cannot read,
 * move or cancel an order belonging to Apalit — and that holds whatever the
 * screen in front of them chose to show.
 *
 * Both halves are needed. This one is the half that cannot be forgotten in a
 * later edit to a query.
 *
 * ── The owner is unaffected ──────────────────────────────────────────────
 *
 * `sees_branch` answers true for every branch when a profile is pinned to
 * none, which is the owner's state and the state of every staff profile that
 * existed before 0078. So this migration changes nothing for anybody today;
 * it starts mattering the moment somebody is pinned.
 */

-- ------------------------------------------------------------
-- Reading
-- ------------------------------------------------------------

drop policy if exists "customer_select_own_orders" on orders;
create policy "customer_select_own_orders" on orders for select
  using (
    -- A customer's own order, wherever it was placed. They ordered from a
    -- shop, not from a branch, and hiding their own receipt because they
    -- bought at the booth would be absurd.
    customer_id = auth.uid()
    -- Staff: their branch only. Unpinned staff see every branch.
    or (is_staff() and sees_branch(branch_id))
  );

-- ------------------------------------------------------------
-- Writing
--
-- The USING clause gates the row as it stands; the WITH CHECK gates the row
-- being written. Both carry the branch test.
--
-- The WITH CHECK is belt and braces rather than the mechanism, and it is
-- worth writing down which is which. Tested against a real Postgres: with
-- the branch clause removed from the WITH CHECK alone, a pinned cashier
-- moving their own order to another branch is STILL refused — Postgres
-- requires the updated row to remain visible to the writer, and the SELECT
-- policy above already denies them the other branch. Remove the clause from
-- BOTH and the move goes through.
--
-- So the clause stays, because a policy should say what it means rather
-- than lean on a side effect of another one. But nobody should believe it
-- is the thing holding the wall up: the SELECT policy is.
-- ------------------------------------------------------------

drop policy if exists "customer_update_own_orders" on orders;
create policy "customer_update_own_orders" on orders for update
  using (
    (is_staff() and sees_branch(branch_id))
    or (customer_id = auth.uid() and status = 'pending')
  )
  with check (
    (is_staff() and sees_branch(branch_id))
    or (customer_id = auth.uid() and status in ('pending', 'cancelled'))
  );

drop policy if exists "staff_delete_orders" on orders;
create policy "staff_delete_orders" on orders for delete
  using (is_staff() and sees_branch(branch_id));

-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

do $$
declare
  v_apalit text;
  v_booth text;
  v_seen int;
  v_moved boolean := false;
begin
  /* Two orders, one at each branch, and a cashier pinned to the booth. */
  perform set_config('request.jwt.claim.sub', '', true);

  insert into auth.users (id, email)
  values ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', 'zz-rls-booth@x')
  on conflict do nothing;
  insert into profiles (id, role, full_name, branch_id)
  values ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', 'staff', 'ZZ RLS Booth', 'express-el-mercado')
  on conflict (id) do update
    set role = excluded.role, branch_id = excluded.branch_id;

  /* Clocked in, or the shift gate refuses the write before row-level
     security is ever consulted — and the check would pass while proving
     nothing about branches. The first run failed exactly that way. */
  insert into staff_shifts (staff_id) values ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb');

  insert into orders (date, revenue, status, branch_id, contact_name)
  values (current_date, 100, 'completed', 'main', 'ZZ At Apalit')
  returning id into v_apalit;
  insert into orders (date, revenue, status, branch_id, contact_name)
  values (current_date, 200, 'completed', 'express-el-mercado', 'ZZ At The Booth')
  returning id into v_booth;

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  /* Reading: the booth's order and not Apalit's. */
  select count(*) into v_seen
    from orders where contact_name in ('ZZ At Apalit', 'ZZ At The Booth');
  if v_seen <> 1 then
    raise exception
      'FAIL: a cashier pinned to the booth can see % of the two test orders — pinned means one branch', v_seen;
  end if;
  if not exists (select 1 from orders where contact_name = 'ZZ At The Booth') then
    raise exception 'FAIL: a cashier pinned to the booth cannot see their own branch''s order';
  end if;

  /* Writing. A refusal here wears two faces and both are correct: a row the
     USING clause hides simply matches nothing, while a row that is visible
     but would become forbidden raises. Either is fine — what matters is that
     the row did not move, which is asserted after the role is reset. */
  begin
    update orders set status = 'cancelled' where contact_name = 'ZZ At Apalit';
  exception
    when insufficient_privilege or check_violation then null;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (
    select 1 from orders where contact_name = 'ZZ At Apalit' and status = 'cancelled'
  ) then
    raise exception 'FAIL: a cashier at the booth cancelled an order belonging to Apalit';
  end if;

  /* And cannot push their own branch's order across to the other one. */
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', true);
  set local role authenticated;
  begin
    update orders set branch_id = 'main' where contact_name = 'ZZ At The Booth';
  exception
    when insufficient_privilege or check_violation then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  select exists (
    select 1 from orders where contact_name = 'ZZ At The Booth' and branch_id = 'main'
  ) into v_moved;
  if v_moved then
    raise exception
      'FAIL: a cashier moved their own branch''s order to another branch';
  end if;

  delete from orders where contact_name in ('ZZ At Apalit', 'ZZ At The Booth');
  delete from staff_shifts where staff_id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
  delete from profiles where id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
  raise notice 'OK: a pinned cashier reads, changes and moves nothing outside their own branch';
end $$;

do $$
declare
  v_seen int;
begin
  /* And somebody unpinned still sees everything, which is every staff
     profile that existed before branches did. A wall that also walls in the
     owner is a wall that gets taken down again a week later. */
  perform set_config('request.jwt.claim.sub', '', true);

  insert into auth.users (id, email)
  values ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', 'zz-rls-roams@x')
  on conflict do nothing;
  insert into profiles (id, role, full_name, branch_id)
  values ('bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', 'owner', 'ZZ RLS Roams', null)
  on conflict (id) do update set role = excluded.role, branch_id = null;

  insert into orders (date, revenue, status, branch_id, contact_name) values
    (current_date, 100, 'completed', 'main', 'ZZ Both A'),
    (current_date, 200, 'completed', 'express-el-mercado', 'ZZ Both B');

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', true);
  set local role authenticated;
  select count(*) into v_seen from orders where contact_name in ('ZZ Both A', 'ZZ Both B');
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  if v_seen <> 2 then
    raise exception 'FAIL: an unpinned owner sees only % of two branches'' orders', v_seen;
  end if;

  delete from orders where contact_name in ('ZZ Both A', 'ZZ Both B');
  delete from profiles where id = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
  raise notice 'OK: somebody pinned to nothing still sees every branch';
end $$;

do $$
declare
  v_mine int;
begin
  /* A customer sees their own order wherever they bought it. They ordered
     from a shop, not from a branch. */
  perform set_config('request.jwt.claim.sub', '', true);
  insert into auth.users (id, email)
  values ('bbbbbbbb-3333-3333-3333-bbbbbbbbbbbb', 'zz-rls-customer@x')
  on conflict do nothing;

  insert into orders (date, revenue, status, branch_id, customer_id, contact_name) values
    (current_date, 100, 'completed', 'express-el-mercado',
     'bbbbbbbb-3333-3333-3333-bbbbbbbbbbbb', 'ZZ Theirs');

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-3333-3333-3333-bbbbbbbbbbbb', true);
  set local role authenticated;
  select count(*) into v_mine from orders where contact_name = 'ZZ Theirs';
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  if v_mine <> 1 then
    raise exception
      'FAIL: a customer cannot see their own order placed at the booth — hiding somebody''s own receipt because of where they bought it is a bug, not security';
  end if;

  delete from orders where contact_name = 'ZZ Theirs';
  raise notice 'OK: a customer sees their own order whichever branch sold it';
end $$;
