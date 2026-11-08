-- =====================================================================
-- ONE MART · Event Demo · B1 ทีวีภาพรวม Realtime
-- =====================================================================
-- ทีวีฟัง INSERT บน pos_sale (Realtime) แล้วเรียก tv_summary() ใหม่ทั้งก้อน
-- security invoker → เห็นเท่าที่ RLS ของผู้เรียกอนุญาต (executive เห็นทุกร้าน · store_owner เห็นร้านตัวเอง)
-- วันตัดตามเวลาไทย · บิลที่ถูกกลับรายการ (มีบิล reverses_id ชี้มา) ไม่นับ
-- "เงินรับจริง" (P1 รับเงินนำส่งจากร้าน) ยังไม่มีตาราง — รอ Migration ชุด 2 · ทีวีแสดงป้ายรอโมดูล

create or replace function public.tv_summary()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    -- ต้อง cast เป็น timestamp ก่อน ไม่งั้น date จะถูกแปลงเป็น timestamptz ตามโซนของ session แล้วเพี้ยน 7 ชม.
    select ((now() at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok' as day_start,
           (((now() at time zone 'Asia/Bangkok')::date) - 6)::timestamp at time zone 'Asia/Bangkok' as week_start
  ),
  sales as (
    select s.* from public.pos_sale s
    where s.status = 'completed' and s.reverses_id is null
      and not exists (select 1 from public.pos_sale r where r.reverses_id = s.id)
  ),
  receipts as (
    select m.store_id, m.occurred_at, m.qty_units * m.unit_wholesale as value
    from public.stock_movement m where m.movement_type = 'receipt'
  ),
  stores as (
    select st.id, st.code, st.name from public.store st where st.lifecycle_status = 'opened'
  )
  select jsonb_build_object(
    'as_of', now(),
    'today', jsonb_build_object(
      'retail_total', (select coalesce(sum(total_amount), 0) from sales, bounds where sold_at >= day_start),
      'bill_count',   (select count(*) from sales, bounds where sold_at >= day_start),
      'delivered_wholesale', (select coalesce(sum(value), 0) from receipts, bounds where occurred_at >= day_start)
    ),
    'week', jsonb_build_object(
      'retail_total', (select coalesce(sum(total_amount), 0) from sales, bounds where sold_at >= week_start),
      'bill_count',   (select count(*) from sales, bounds where sold_at >= week_start),
      'delivered_wholesale', (select coalesce(sum(value), 0) from receipts, bounds where occurred_at >= week_start)
    ),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'code', st.code, 'name', st.name,
               'retail_today', coalesce(t.total, 0), 'bills_today', coalesce(t.n, 0),
               'last_sold_at', t.last_at) order by st.code)
      from stores st
      left join lateral (
        select sum(s.total_amount) as total, count(*) as n, max(s.sold_at) as last_at
        from sales s, bounds b where s.store_id = st.id and s.sold_at >= b.day_start
      ) t on true
    ), '[]'::jsonb),
    'feed', coalesce((
      select jsonb_agg(f order by f.sold_at desc) from (
        select s.id, s.store_id, s.sold_at, s.total_amount, s.payment_method, st.name as store_name,
               (select coalesce(sum(l.qty_units), 0) from public.pos_sale_line l where l.pos_sale_id = s.id) as units
        from sales s join public.store st on st.id = s.store_id
        order by s.sold_at desc limit 12
      ) f
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.tv_summary() from public;
grant execute on function public.tv_summary() to authenticated;
