-- ============================================================
-- Packaging belongs to how a dish is served, not to a second dish
--
-- 27 of the 72 dishes on this menu are "(T.O) X" duplicates of an existing
-- "X", and every one of them differs only by packaging: a container, a sauce
-- cup, a bag. That costs far more than the packaging does — every price
-- change has to be made twice or the twins drift, the customer scrolls past
-- the same dish twice, and the best-seller list splits in half so neither
-- twin ever looks like a top seller.
--
-- So: one dish, one recipe, one price. Packaging is attached separately and
-- charged only when the food actually leaves in a box.
-- ============================================================

/* What this dish needs to travel. Per serving. */
create table if not exists meal_packaging (
  id bigserial primary key,
  meal_id text not null references meals(id) on delete cascade,
  ref_type text not null check (ref_type in ('inv', 'batch')),
  ref_id text not null,
  qty numeric not null
);
create index if not exists idx_meal_packaging_meal on meal_packaging(meal_id);

/* What a take-out ORDER needs, once, regardless of how many dishes are in it.
   The bag is the obvious one — pricing it into each dish charges four bags
   for a four-dish order, which is where the old duplicates quietly got it
   wrong. */
create table if not exists order_packaging (
  id bigserial primary key,
  ref_type text not null check (ref_type in ('inv', 'batch')),
  ref_id text not null,
  qty numeric not null
);

alter table meal_packaging enable row level security;
alter table order_packaging enable row level security;

drop policy if exists "read_meal_packaging" on meal_packaging;
create policy "read_meal_packaging" on meal_packaging for select using (true);
drop policy if exists "staff_write_meal_packaging" on meal_packaging;
create policy "staff_write_meal_packaging" on meal_packaging
  for all using (is_staff()) with check (is_staff());

drop policy if exists "read_order_packaging" on order_packaging;
create policy "read_order_packaging" on order_packaging for select using (true);
drop policy if exists "staff_write_order_packaging" on order_packaging;
create policy "staff_write_order_packaging" on order_packaging
  for all using (is_staff()) with check (is_staff());

-- ============================================================
-- Eating at the stall is a third thing
--
-- `fulfillment` was pickup or delivery, both of which leave in a box. People
-- do actually sit and eat here, and that is the case where no packaging is
-- used at all — which is exactly the distinction the duplicate menu was
-- standing in for.
-- ============================================================
alter table orders drop constraint if exists orders_fulfillment_check;
alter table orders add constraint orders_fulfillment_check
  check (fulfillment in ('pickup', 'delivery', 'dine_in'));

-- ============================================================
-- Requirements now include packaging, when it applies
-- ============================================================
create or replace function order_requirements(p_order_id text)
returns table (ref_type text, ref_id text, qty numeric)
language sql
stable
as $$
  with
  ord as (select fulfillment from orders where id = p_order_id),
  -- Anything that isn't eaten here leaves in a box.
  packed as (select (select fulfillment from ord) <> 'dine_in' as yes),
  tree as (
    with recursive meal_tree as (
      select ol.meal_id, ol.qty::numeric as mult, 0 as depth
      from order_lines ol
      where ol.order_id = p_order_id
      union all
      select mc.component_meal_id, mt.mult * mc.qty, mt.depth + 1
      from meal_tree mt
      join meal_components mc on mc.meal_id = mt.meal_id
      where mt.depth < 5
    )
    select meal_id, mult from meal_tree
  ),
  food as (
    select mi.ref_type, mi.ref_id, sum(mi.qty * t.mult)::numeric as qty
    from tree t
    join meal_ingredients mi on mi.meal_id = t.meal_id
    group by mi.ref_type, mi.ref_id
  ),
  /* Packaging follows the dish that was ordered, so a combo's packaging is
     the combo's own — not one box per component dish inside it. */
  dish_packaging as (
    select mp.ref_type, mp.ref_id, sum(mp.qty * ol.qty)::numeric as qty
    from order_lines ol
    join meal_packaging mp on mp.meal_id = ol.meal_id
    where ol.order_id = p_order_id and (select yes from packed)
    group by mp.ref_type, mp.ref_id
  ),
  /* Once per order, not once per dish. */
  per_order as (
    select op.ref_type, op.ref_id, op.qty::numeric as qty
    from order_packaging op
    where (select yes from packed)
      and exists (select 1 from order_lines where order_id = p_order_id)
  )
  select ref_type, ref_id, sum(qty)::numeric
  from (
    select * from food
    union all select * from dish_packaging
    union all select * from per_order
  ) all_lines
  group by ref_type, ref_id;
$$;

do $$
begin
  execute 'revoke all on function order_requirements(text) from public, anon, authenticated';
  execute 'grant execute on function order_requirements(text) to service_role';
end $$;
