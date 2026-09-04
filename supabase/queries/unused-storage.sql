-- ============================================================
-- What is in storage that nothing points at.
--
-- READ-ONLY. This lists candidates; it deletes nothing. The delete is a
-- separate query at the bottom, commented out, and it should stay commented
-- until you have read this list and recognised every line on it.
--
-- Why a query rather than a look through the Storage tab: almost nothing in
-- that bucket is referenced by the website's code. Menu photos, GCash QR
-- codes, promo images and customers' payment receipts are all referenced by
-- a URL stored in a database row. A file that looks unused in the dashboard
-- may be the photo on your best-selling dish.
--
-- So this checks every column in the database that can hold one, plus the
-- handful the code names directly.
-- ============================================================

with used_in_database as (
  select image_url            as url from meals             where image_url            is not null
  union select image_url             from announcements     where image_url            is not null
  union select video_url             from announcements     where video_url            is not null
  union select payment_receipt_url   from orders            where payment_receipt_url  is not null
  union select gcash_qr_url          from payment_settings  where gcash_qr_url         is not null
  union select p_receipt_url         from payment_settings  where p_receipt_url        is not null
  union select payment_receipt_url   from payment_settings  where payment_receipt_url  is not null
  union select p_receipt_url         from reviews           where p_receipt_url        is not null
),

-- Named directly in src/app/page.tsx. These are in no table, so nothing above
-- would protect them — and deleting one blanks the homepage.
used_in_code(name) as (values
  ('Our Story.jpeg'),
  ('opt/7.webp'),
  ('opt/9.webp'),
  ('opt/21.webp'),
  ('opt/26.webp'),
  ('opt/FB.webp'),
  ('opt/FB (2).webp')
),

candidates as (
  select
    o.name,
    coalesce((o.metadata->>'size')::bigint, 0) as bytes,
    o.created_at
  from storage.objects o
  where o.bucket_id = 'PepperPan'
    and not exists (select 1 from used_in_code c where c.name = o.name)
    and not exists (
      select 1 from used_in_database u
      where
        -- A stored URL is percent-encoded; the object name is not. Compare
        -- both ways rather than trusting one — a space becomes %20, and
        -- missing that match is how a live file ends up on a delete list.
        u.url like '%' || o.name || '%'
        or u.url like '%' || replace(replace(o.name, ' ', '%20'), '''', '%27') || '%'
    )
)

select
  name,
  pg_size_pretty(bytes) as size,
  created_at::date as uploaded
from candidates
order by bytes desc;

-- ------------------------------------------------------------
-- The total, so you know what this is worth before doing it.
-- Run this on its own by selecting just these lines.
-- ------------------------------------------------------------
-- select count(*) as files, pg_size_pretty(sum(bytes)) as reclaimable from candidates;

-- ============================================================
-- THE DELETE — leave commented until you have read the list above.
--
-- There is no undo and no recycle bin. Download anything you might want
-- again first: Storage → select the files → Download.
--
-- Delete a few by name rather than the whole list, the first time:
--
--   delete from storage.objects
--   where bucket_id = 'PepperPan'
--     and name in ('sketch graphics.png', 'mission and vision bg.png');
-- ============================================================
