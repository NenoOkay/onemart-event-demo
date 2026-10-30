-- =====================================================================
-- ONE MART · Event Demo · วันที่ 3 — P1 เข้าสู่ระบบ · P2 ปุ่มลัดสินค้าขายดี
-- =====================================================================

-- P1: รายชื่อร้านให้เลือกก่อน login — คืนเฉพาะรหัส + ชื่อร้านที่เปิดแล้ว (ไม่เปิดข้อมูลอื่น)
create or replace function public.pos_login_stores()
returns table (code text, name text)
language sql stable security definer set search_path = '' as $$
  select s.code, s.name from public.store s
  where s.lifecycle_status = 'opened' and s.owner_user_id is not null
  order by s.code
$$;
revoke all on function public.pos_login_stores() from public;
grant execute on function public.pos_login_stores() to anon, authenticated;

-- P2: สินค้าขายดี 7 วันล่าสุดต่อร้าน (ใช้ RLS ของผู้เรียก)
create view public.v_best_seller_7d with (security_invoker = true) as
  select l.store_id, l.sku_id, sum(l.qty_units)::int as qty_7d
  from public.pos_sale_line l
  join public.pos_sale s on s.id = l.pos_sale_id
  where s.sold_at >= now() - interval '7 days' and s.status = 'completed'
  group by l.store_id, l.sku_id;

grant select on public.v_best_seller_7d to authenticated;
revoke all on public.v_best_seller_7d from anon;
