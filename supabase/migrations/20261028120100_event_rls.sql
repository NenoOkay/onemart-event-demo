-- =====================================================================
-- ONE MART · Event Demo · Migration ชุด 1 — RLS
-- อ้างอิง: DD ชีต Access · กติกาข้อ 7 (บังคับด้วย RLS ไม่ใช่แค่ UI)
-- หลัก: anon ไม่เห็นอะไรเลย · ไม่มี policy UPDATE/DELETE บน Ledger/บิล (และมี trigger กันซ้ำอีกชั้น)
--       การปิด effective_to ทำโดย trigger (security definer) ไม่ใช่ผู้ใช้
-- =====================================================================

alter table public.system_setting   enable row level security;
alter table public.app_user         enable row level security;
alter table public.province         enable row level security;
alter table public.team             enable row level security;
alter table public.store            enable row level security;
alter table public.store_assignment enable row level security;
alter table public.product          enable row level security;
alter table public.sku              enable row level security;
alter table public.barcode          enable row level security;
alter table public.wholesale_price  enable row level security;
alter table public.reference_price  enable row level security;
alter table public.store_price      enable row level security;
alter table public.sales_channel    enable row level security;
alter table public.pos_sale         enable row level security;
alter table public.pos_sale_line    enable row level security;
alter table public.stock_movement   enable row level security;
alter table public.audit_log        enable row level security;

-- ค่าระบบ: อ่านได้ (หน้าจอต้องรู้ demo_mode) · แก้ผ่าน service role เท่านั้น
create policy system_setting_read on public.system_setting for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- A · องค์กร ผู้ใช้ ร้าน
-- ---------------------------------------------------------------------
create policy app_user_read on public.app_user for select to authenticated using (true);
create policy app_user_admin_ins on public.app_user for insert to authenticated with check (app.has_role('admin'));
create policy app_user_admin_upd on public.app_user for update to authenticated using (app.has_role('admin'));

create policy province_read on public.province for select to authenticated
  using (app.my_role() is distinct from 'store_owner');
create policy province_admin_ins on public.province for insert to authenticated with check (app.has_role('admin'));
create policy province_admin_upd on public.province for update to authenticated using (app.has_role('admin'));

create policy team_read on public.team for select to authenticated
  using (app.my_role() is distinct from 'store_owner');
create policy team_admin_ins on public.team for insert to authenticated with check (app.has_role('admin'));
create policy team_admin_upd on public.team for update to authenticated using (app.has_role('admin'));

create policy store_read on public.store for select to authenticated using (app.can_see_store(id));
create policy store_admin_ins on public.store for insert to authenticated with check (app.has_role('admin'));
create policy store_admin_upd on public.store for update to authenticated using (app.has_role('admin'));

create policy store_assignment_read on public.store_assignment for select to authenticated
  using (app.my_role() is distinct from 'store_owner' and app.can_see_store(store_id));
create policy store_assignment_ins on public.store_assignment for insert to authenticated
  with check (app.has_role('admin', 'promoter_manager'));

-- ---------------------------------------------------------------------
-- B · สินค้า
-- ---------------------------------------------------------------------
create policy product_read on public.product for select to authenticated using (true);
create policy product_ins on public.product for insert to authenticated with check (app.has_role('admin', 'purchasing'));
create policy product_upd on public.product for update to authenticated using (app.has_role('admin', 'purchasing'));

create policy sku_read on public.sku for select to authenticated using (true);
create policy sku_ins on public.sku for insert to authenticated with check (app.has_role('admin', 'purchasing'));
create policy sku_upd on public.sku for update to authenticated using (app.has_role('admin', 'purchasing'));

create policy barcode_read on public.barcode for select to authenticated using (true);
create policy barcode_ins on public.barcode for insert to authenticated
  with check (app.has_role('admin', 'purchasing', 'promoter'));
create policy barcode_upd on public.barcode for update to authenticated using (app.has_role('admin', 'purchasing'));

-- ---------------------------------------------------------------------
-- C · ราคา
-- ---------------------------------------------------------------------
create policy wholesale_price_read on public.wholesale_price for select to authenticated
  using (app.my_role() is distinct from 'promoter');
create policy wholesale_price_ins on public.wholesale_price for insert to authenticated
  with check (app.has_role('admin', 'purchasing'));

create policy reference_price_read on public.reference_price for select to authenticated using (true);
create policy reference_price_ins on public.reference_price for insert to authenticated
  with check (app.has_role('admin', 'purchasing'));

create policy store_price_read on public.store_price for select to authenticated using (app.can_see_store(store_id));
-- เจ้าของร้านตั้งราคาร้านตนเอง (มีผลทันที) · ฝ่ายส่งเสริมกรอกแทนได้แต่เป็น "รอยืนยัน"
create policy store_price_owner_ins on public.store_price for insert to authenticated
  with check (app.is_my_store(store_id) and set_by_owner and created_by = app.my_user_id());
create policy store_price_promoter_ins on public.store_price for insert to authenticated
  with check (app.has_role('promoter') and app.can_see_store(store_id) and not set_by_owner
              and approved_by is null and created_by = app.my_user_id());
create policy store_price_admin_ins on public.store_price for insert to authenticated
  with check (app.has_role('admin'));

-- ---------------------------------------------------------------------
-- E · POS — สร้างบิลได้เฉพาะบัญชีเจ้าของร้าน ของร้านตนเอง (ฝ่ายส่งเสริมสร้างไม่ได้)
-- ---------------------------------------------------------------------
create policy sales_channel_read on public.sales_channel for select to authenticated using (true);

create policy pos_sale_read on public.pos_sale for select to authenticated using (app.can_see_store(store_id));
create policy pos_sale_owner_ins on public.pos_sale for insert to authenticated
  with check (app.is_my_store(store_id) and created_by = app.my_user_id() and reverses_id is null);

create policy pos_sale_line_read on public.pos_sale_line for select to authenticated using (app.can_see_store(store_id));
create policy pos_sale_line_owner_ins on public.pos_sale_line for insert to authenticated
  with check (
    app.is_my_store(store_id)
    and created_by = app.my_user_id()
    and exists (select 1 from public.pos_sale s
                where s.id = pos_sale_id and s.store_id = pos_sale_line.store_id and s.created_by = app.my_user_id()));

-- ---------------------------------------------------------------------
-- E · สต๊อก — ขายสร้างโดย trigger · รับเข้า/ปรับปรุงโดย admin/จัดซื้อ
-- ---------------------------------------------------------------------
create policy stock_movement_read on public.stock_movement for select to authenticated using (app.can_see_store(store_id));
create policy stock_movement_ins on public.stock_movement for insert to authenticated
  with check (app.has_role('admin', 'purchasing') and movement_type not in ('sale_pos', 'sale_derived'));

-- ---------------------------------------------------------------------
-- H · audit_log — อ่านได้ admin/ผู้บริหาร/บัญชี · เขียนโดย trigger เท่านั้น
-- ---------------------------------------------------------------------
create policy audit_log_read on public.audit_log for select to authenticated
  using (app.has_role('admin', 'executive', 'accounting'));

-- anon ไม่มีสิทธิ์ใด ๆ กับตาราง (ไม่มี policy ถึง anon) · ตัด grant ออกอีกชั้น
revoke all on all tables in schema public from anon;
