-- =====================================================================
-- ONE MART · Event Demo · Migration ชุด 1 — โครงสร้างหลัก
-- อ้างอิง: Data Dictionary Pilot 101026 (DD) · Decision Register ส่วน G/H
-- ขอบเขต: Master · ราคา · สต๊อกฝากขาย · POS · audit  (P1–P6 · B1 · B2)
-- ชุด 2 (วันที่ 7–8): round · shipment · expense · receivable · payment · benefit · parameter
--
-- ส่วนที่ต่างจาก DD (ตกลงกับ Nukie 28 ต.ค. 69):
--   1. เพิ่ม pos_sale / pos_sale_line (DD ไม่มี) · stock_movement.movement_type เพิ่ม 'sale_pos'
--   2. (ชุด 2) retail_sales.close_count_id เป็น NULL ได้เมื่อ method = 'pos'
--   3. ยึดชื่อ DD: stock_movement.store_id = ที่ตั้ง (location) · owner = เจ้าของ (แทน location_id/owner_id)
--   4. เพิ่ม route · actual_actor · channel_id ในตารางธุรกรรม · price_includes_vat ใน store_price/reference_price
--   5. บทบาทเดโม: store_owner · promoter · promoter_manager · executive (+ admin)
--   6. pos_sale_line เก็บ store_id ซ้ำจากหัวบิล (ใช้กับ RLS และ Realtime filter)
-- =====================================================================

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Enums (DD ชีต Enums)
-- ---------------------------------------------------------------------
create type public.user_role as enum (
  'admin', 'executive', 'purchasing', 'accounting',
  'promoter_manager', 'promoter', 'store_owner'
);
create type public.actor_type as enum ('human', 'ai', 'system');

-- ---------------------------------------------------------------------
-- ค่าระบบ — demo_mode = true บังคับ is_test = true ทุกแถว (Event Project)
-- ---------------------------------------------------------------------
create table public.system_setting (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.system_setting (key, value) values ('demo_mode', 'true'::jsonb);

-- ---------------------------------------------------------------------
-- Helper (plpgsql: อ้างตารางตอนรันจริง จึงสร้างก่อนตารางได้)
-- ---------------------------------------------------------------------
create or replace function app.is_demo() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce((select (value #>> '{}')::boolean from public.system_setting where key = 'demo_mode'), false);
end $$;

create or replace function app.my_user_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select id from public.app_user where auth_user_id = auth.uid() and status = 'active');
end $$;

create or replace function app.my_role() returns public.user_role
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select role from public.app_user where auth_user_id = auth.uid() and status = 'active');
end $$;

create or replace function app.has_role(variadic roles public.user_role[]) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce(app.my_role() = any (roles), false);
end $$;

-- ร้านที่ผู้ใช้ปัจจุบันเห็นได้ (DD ชีต Access)
create or replace function app.can_see_store(p_store_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.user_role := app.my_role();
  v_me   uuid := app.my_user_id();
begin
  if v_role in ('admin', 'executive', 'purchasing', 'accounting') then
    return true;
  elsif v_role = 'store_owner' then
    return exists (select 1 from public.store s where s.id = p_store_id and s.owner_user_id = v_me);
  elsif v_role in ('promoter', 'promoter_manager') then
    return exists (
      select 1 from public.store_assignment a
      where a.store_id = p_store_id
        and (a.promoter_user_id = v_me or a.manager_user_id = v_me)
        and a.effective_from <= current_date
        and (a.effective_to is null or a.effective_to >= current_date));
  end if;
  return false;
end $$;

-- ร้านของเจ้าของร้านคนปัจจุบัน
create or replace function app.is_my_store(p_store_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return app.my_role() = 'store_owner'
     and exists (select 1 from public.store s where s.id = p_store_id and s.owner_user_id = app.my_user_id());
end $$;

-- ---------------------------------------------------------------------
-- Trigger functions ทั่วไป
-- ---------------------------------------------------------------------
create or replace function app.tg_force_is_test() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if app.is_demo() then new.is_test := true; end if;
  return new;
end $$;

create or replace function app.tg_touch_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(app.my_user_id(), new.updated_by);
  return new;
end $$;

-- Ledger: ห้าม UPDATE/DELETE ทุกบทบาท รวม admin (PL2-26)
create or replace function app.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ตาราง % เป็น append-only: ห้าม % — แก้ด้วยรายการกลับ (reverses_id + reason)', tg_table_name, tg_op;
end $$;

-- Versioned: ห้าม DELETE · UPDATE ได้เฉพาะปิด effective_to และบันทึกการอนุมัติ
create or replace function app.tg_versioned_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_keep text[] := array['effective_to', 'approved_by', 'approved_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'ตาราง % เป็น Versioned: ห้ามลบ — ปิดด้วย effective_to', tg_table_name;
  end if;
  if (to_jsonb(new) - v_keep) is distinct from (to_jsonb(old) - v_keep) then
    raise exception 'ตาราง % เป็น Versioned: แก้ได้เฉพาะ effective_to และการอนุมัติ — สร้างแถวใหม่แทน', tg_table_name;
  end if;
  if old.effective_to is not null and new.effective_to is distinct from old.effective_to then
    raise exception 'ตาราง %: แถวนี้ปิดแล้ว แก้ effective_to ไม่ได้', tg_table_name;
  end if;
  return new;
end $$;

-- Versioned: แถวใหม่ปิดแถวเดิมที่ยังเปิดของคีย์เดียวกันอัตโนมัติ
-- tg_argv = ชื่อคอลัมน์คีย์ (uuid) · effective_from เป็น date ตาม DD
-- ถ้าแก้ซ้ำในวันเดียวกัน แถวเดิมปิดที่วันนั้น และราคาปัจจุบันใช้ created_at ล่าสุดตัดสิน
create or replace function app.tg_versioned_close_prev() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cond text := '';
  v_new  jsonb := to_jsonb(new);
  v_col  text;
  v_later boolean;
begin
  -- store_price ที่ฝ่ายส่งเสริมกรอกแทน = รอยืนยัน ยังไม่ปิดราคาเดิม
  if tg_table_name = 'store_price' and not coalesce((v_new ->> 'set_by_owner')::boolean, false) then
    return null;
  end if;
  foreach v_col in array tg_argv loop
    v_cond := v_cond || format(' and %I = (%L::jsonb ->> %L)::uuid', v_col, v_new, v_col);
  end loop;

  execute format('select exists (select 1 from public.%I where effective_to is null and id <> %L and effective_from > %L::date %s)',
                 tg_table_name, new.id, new.effective_from, v_cond)
    into v_later;
  if v_later then
    raise exception 'ตาราง %: มีแถวที่เริ่มหลังวันที่ % อยู่แล้ว — ห้ามย้อนวันที่', tg_table_name, new.effective_from;
  end if;

  execute format('update public.%I set effective_to = case when %L::date > effective_from then %L::date - 1 else effective_from end
                  where effective_to is null and id <> %L %s',
                 tg_table_name, new.effective_from, new.effective_from, new.id, v_cond);
  return null;
end $$;

-- audit_log: บันทึกทุก insert/update (ห้ามลบ)
create or replace function app.tg_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := app.my_user_id();
begin
  insert into public.audit_log (table_name, row_id, action, actor_user_id, actor_type, before_data, after_data, is_test)
  values (
    tg_table_name,
    case when tg_op = 'INSERT' then new.id else old.id end,
    lower(tg_op),
    v_me,
    case when v_me is null then 'system'::public.actor_type else 'human'::public.actor_type end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    app.is_demo() or coalesce((to_jsonb(new) ->> 'is_test')::boolean, false));
  return null;
end $$;

-- ---------------------------------------------------------------------
-- A · องค์กร ผู้ใช้ และร้าน
-- ---------------------------------------------------------------------
create table public.app_user (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users (id),
  full_name       text not null,
  phone           text,
  line_user_id    text,
  role            public.user_role not null,
  contractor_type text check (contractor_type in ('independent_contractor')),
  status          text not null default 'active' check (status in ('active', 'suspended', 'left')),
  created_at      timestamptz not null default now(),
  created_by      uuid not null default app.my_user_id() references public.app_user (id),
  updated_at      timestamptz,
  updated_by      uuid references public.app_user (id),
  is_test         boolean not null default false
);

create table public.province (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name_th      text not null,
  pilot_status text not null default 'candidate' check (pilot_status in ('candidate', 'pending_confirmation', 'active', 'retired')),
  created_at   timestamptz not null default now(),
  created_by   uuid not null default app.my_user_id() references public.app_user (id),
  updated_at   timestamptz,
  updated_by   uuid references public.app_user (id),
  is_test      boolean not null default false
);

create table public.team (
  id          uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.province (id),
  code        text not null unique,
  name        text not null,
  status      text not null default 'candidate' check (status in ('candidate', 'pending_confirmation', 'active', 'retired')),
  created_at  timestamptz not null default now(),
  created_by  uuid not null default app.my_user_id() references public.app_user (id),
  updated_at  timestamptz,
  updated_by  uuid references public.app_user (id),
  is_test     boolean not null default false
);

create table public.store (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.team (id),
  province_id      uuid not null references public.province (id),
  code             text not null unique,
  name             text not null,
  owner_user_id    uuid references public.app_user (id),
  owner_name       text not null,
  phone            text,
  address          text,
  subdistrict      text,
  district         text,
  postcode         text,
  lat              numeric(9, 6),
  lng              numeric(9, 6),
  lifecycle_status text not null default 'surveyed' check (lifecycle_status in ('surveyed', 'selected', 'opened', 'paused', 'exited')),
  selected_by      uuid references public.app_user (id),
  opened_at        date,
  exited_at        date,
  created_at       timestamptz not null default now(),
  created_by       uuid not null default app.my_user_id() references public.app_user (id),
  updated_at       timestamptz,
  updated_by       uuid references public.app_user (id),
  is_test          boolean not null default false
);

create table public.store_assignment (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.store (id),
  promoter_user_id uuid not null references public.app_user (id),
  manager_user_id  uuid not null references public.app_user (id),
  effective_from   date not null,
  effective_to     date,
  created_at       timestamptz not null default now(),
  created_by       uuid not null default app.my_user_id() references public.app_user (id),
  approved_by      uuid references public.app_user (id),
  approved_at      timestamptz,
  is_test          boolean not null default false,
  check (effective_to is null or effective_to >= effective_from),
  check (approved_by is null or approved_by <> created_by),
  check (promoter_user_id <> manager_user_id)
);

-- ---------------------------------------------------------------------
-- B · สินค้า SKU และบาร์โค้ด
-- ---------------------------------------------------------------------
create table public.product (
  id         uuid primary key default gen_random_uuid(),
  name_th    text not null,
  brand      text,
  category   text,
  created_at timestamptz not null default now(),
  created_by uuid not null default app.my_user_id() references public.app_user (id),
  updated_at timestamptz,
  updated_by uuid references public.app_user (id),
  is_test    boolean not null default false
);

create table public.sku (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.product (id),
  sku_code             text not null unique,
  size_desc            text not null,
  base_uom             text not null,
  pack_uom             text not null,
  units_per_pack       int not null check (units_per_pack > 0),
  single_unit_sellable boolean not null default false,
  vat_type             text not null default 'unknown' check (vat_type in ('vat', 'non_vat', 'exempt', 'unknown')),
  shelf_life_days      int,
  expiry_required      boolean not null default false,
  weight_g             numeric,
  status               text not null default 'active' check (status in ('active', 'inactive')),
  created_at           timestamptz not null default now(),
  created_by           uuid not null default app.my_user_id() references public.app_user (id),
  updated_at           timestamptz,
  updated_by           uuid references public.app_user (id),
  is_test              boolean not null default false
);

create table public.barcode (
  id                    uuid primary key default gen_random_uuid(),
  sku_id                uuid not null references public.sku (id),
  barcode               text not null unique,
  level                 text not null check (level in ('unit', 'pack')),
  units_per_level       int not null check (units_per_level > 0),
  verified_from_product boolean not null default false,
  created_at            timestamptz not null default now(),
  created_by            uuid not null default app.my_user_id() references public.app_user (id),
  updated_at            timestamptz,
  updated_by            uuid references public.app_user (id),
  is_test               boolean not null default false,
  check (level <> 'unit' or units_per_level = 1)
);

-- ---------------------------------------------------------------------
-- C · ราคา (ราคาต้นทาง supplier_price อยู่ชุด 2 กับงานจัดซื้อ)
-- ---------------------------------------------------------------------
create table public.wholesale_price (
  id                 uuid primary key default gen_random_uuid(),
  sku_id             uuid not null references public.sku (id),
  price_per_unit     numeric(12, 4) not null check (price_per_unit >= 0),
  price_includes_vat boolean,                     -- NULL = ยังไม่รู้ ห้ามเดา (PL2-12)
  source_note        text,
  effective_from     date not null,
  effective_to       date,
  created_at         timestamptz not null default now(),
  created_by         uuid not null default app.my_user_id() references public.app_user (id),
  approved_by        uuid references public.app_user (id),
  approved_at        timestamptz,
  is_test            boolean not null default false,
  check (effective_to is null or effective_to >= effective_from),
  check (approved_by is null or approved_by <> created_by)
);

create table public.reference_price (
  id                     uuid primary key default gen_random_uuid(),
  sku_id                 uuid not null references public.sku (id),
  kind                   text not null check (kind in ('recommended', 'seven_eleven', 'cj', 'nearby_store', 'other')),
  province_id            uuid references public.province (id),
  price_per_unit         numeric(12, 2) not null check (price_per_unit >= 0),
  price_includes_vat     boolean,                 -- เพิ่มจาก DD (ข้อ 4)
  observed_date          date not null,
  evidence_attachment_id uuid,                    -- FK attachment เพิ่มในชุดถัดไป
  created_at             timestamptz not null default now(),
  created_by             uuid not null default app.my_user_id() references public.app_user (id),
  actor_type             public.actor_type not null default 'human',
  reason                 text,
  reverses_id            uuid references public.reference_price (id),
  is_test                boolean not null default false,
  check (reverses_id is null or reason is not null)
);

create table public.store_price (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.store (id),
  sku_id                uuid not null references public.sku (id),
  retail_price_per_unit numeric(12, 2) not null check (retail_price_per_unit >= 0),
  price_includes_vat    boolean,                  -- เพิ่มจาก DD (ข้อ 4)
  set_by_owner          boolean not null,
  effective_from        date not null,
  effective_to          date,
  created_at            timestamptz not null default now(),
  created_by            uuid not null default app.my_user_id() references public.app_user (id),
  approved_by           uuid references public.app_user (id),
  approved_at           timestamptz,
  is_test               boolean not null default false,
  check (effective_to is null or effective_to >= effective_from),
  check (approved_by is null or approved_by <> created_by)
);

-- ---------------------------------------------------------------------
-- ช่องทางขาย (lookup เล็ก · ไม่ใช่โมดูล Channel เต็มรูป — อยู่ Backlog)
-- ---------------------------------------------------------------------
create table public.sales_channel (
  id         text primary key,
  name_th    text not null,
  created_at timestamptz not null default now()
);
insert into public.sales_channel (id, name_th) values
  ('store_pos', 'POS หน้าร้าน ONE MART'),
  ('stock_count', 'นับสต๊อก (Pilot)');

-- ---------------------------------------------------------------------
-- E · POS (เพิ่มจาก DD ข้อ 1) — สร้างบิลผ่าน RPC ในวันที่ 4 · ไม่มียกเลิก/ลบบิลในเดโม
-- ---------------------------------------------------------------------
create table public.pos_sale (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.store (id),
  channel_id      text not null default 'store_pos' references public.sales_channel (id),
  route           text not null default 'p1_to_onemart' check (route in ('p1_to_onemart')),
  external_txn_id text not null,                 -- รหัสบิลจากเครื่อง (กันส่งซ้ำ)
  source_system   text not null default 'onemart_pos',
  sold_at         timestamptz not null default now(),
  payment_method  text not null check (payment_method in ('cash', 'promptpay_demo')),
  total_amount    numeric(12, 2) not null check (total_amount >= 0),
  cash_received   numeric(12, 2),
  change_amount   numeric(12, 2),
  status          text not null default 'completed' check (status in ('completed', 'reversed')),
  actual_actor    uuid references public.app_user (id),   -- ผู้ลงมือจริง (ถ้าต่างจาก created_by)
  created_at      timestamptz not null default now(),
  created_by      uuid not null default app.my_user_id() references public.app_user (id),
  approved_by     uuid references public.app_user (id),
  approved_at     timestamptz,
  actor_type      public.actor_type not null default 'human',
  reason          text,
  reverses_id     uuid references public.pos_sale (id),
  is_test         boolean not null default false,
  unique (source_system, external_txn_id),
  check (payment_method <> 'cash' or (cash_received is not null and cash_received >= total_amount)),
  check (reverses_id is null or reason is not null)
);

create table public.pos_sale_line (
  id                         uuid primary key default gen_random_uuid(),
  pos_sale_id                uuid not null references public.pos_sale (id),
  store_id                   uuid not null references public.store (id),  -- เติมจากหัวบิลโดย trigger
  sku_id                     uuid not null references public.sku (id),
  barcode_scanned            text,
  qty_units                  int not null check (qty_units > 0),
  retail_price_per_unit      numeric(12, 2) not null,   -- ราคาขายจริงของร้าน ณ ตอนขาย
  store_price_id             uuid not null references public.store_price (id),
  recommended_price_per_unit numeric(12, 2),            -- ราคาแนะนำ ณ ตอนขาย (เก็บแยก)
  wholesale_per_unit         numeric(12, 4) not null,   -- จากการรับเข้าล่าสุด
  cost_per_unit              numeric(12, 4) not null,
  line_total                 numeric(12, 2) generated always as (qty_units * retail_price_per_unit) stored,
  created_at                 timestamptz not null default now(),
  created_by                 uuid not null default app.my_user_id() references public.app_user (id),
  is_test                    boolean not null default false
);

-- ---------------------------------------------------------------------
-- E · สมุดสต๊อกฝากขาย (Ledger) — store_id = ที่ตั้ง · owner = เจ้าของ (PL2-04)
-- ---------------------------------------------------------------------
create table public.stock_movement (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.store (id),
  owner          text not null default 'project_one' check (owner in ('project_one')),
  sku_id         uuid not null references public.sku (id),
  round_store_id uuid,                            -- FK round_store เพิ่มในชุด 2
  movement_type  text not null check (movement_type in (
                   'receipt', 'sale_derived', 'sale_pos', 'damage', 'loss', 'expired',
                   'return_to_p1', 'count_adjust', 'reversal')),
  qty_units      int not null check (qty_units <> 0),
  unit_cost      numeric(12, 4) not null,
  unit_wholesale numeric(12, 4) not null,
  source_table   text not null,
  source_id      uuid not null,
  occurred_at    timestamptz not null,
  route          text not null default 'p1_to_onemart' check (route in ('p1_to_onemart')),
  channel_id     text references public.sales_channel (id),
  actual_actor   uuid references public.app_user (id),
  created_at     timestamptz not null default now(),
  created_by     uuid not null default app.my_user_id() references public.app_user (id),
  actor_type     public.actor_type not null default 'human',
  reason         text,
  reverses_id    uuid references public.stock_movement (id),
  is_test        boolean not null default false,
  check (reverses_id is null or reason is not null),
  check (movement_type not in ('count_adjust', 'reversal', 'damage', 'loss', 'expired') or reason is not null),
  check ((movement_type in ('receipt') and qty_units > 0)
      or (movement_type in ('sale_derived', 'sale_pos', 'damage', 'loss', 'expired', 'return_to_p1') and qty_units < 0)
      or movement_type in ('count_adjust', 'reversal'))
);

-- ---------------------------------------------------------------------
-- H · audit_log (ห้ามลบ)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  table_name    text not null,
  row_id        uuid not null,
  action        text not null check (action in ('insert', 'update', 'approve', 'reverse', 'export')),
  actor_user_id uuid references public.app_user (id),
  actor_type    public.actor_type not null,
  before_data   jsonb,
  after_data    jsonb,
  reason        text,
  created_at    timestamptz not null default now(),
  is_test       boolean not null default false
);

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------
create index on public.store (team_id);
create index on public.store_assignment (store_id, effective_from);
create index on public.sku (product_id);
create index on public.barcode (sku_id);
create index on public.wholesale_price (sku_id, effective_from);
create index on public.reference_price (sku_id, kind, observed_date);
create index on public.store_price (store_id, sku_id, effective_from);
create index on public.pos_sale (store_id, sold_at desc);
create index on public.pos_sale (sold_at desc);
create index on public.pos_sale_line (pos_sale_id);
create index on public.pos_sale_line (store_id, sku_id);
create index on public.stock_movement (store_id, sku_id, occurred_at);
create index on public.audit_log (table_name, row_id);

-- ---------------------------------------------------------------------
-- ฟังก์ชันราคา/ต้นทุน ณ ปัจจุบัน
-- ---------------------------------------------------------------------
create or replace function app.current_store_price(p_store_id uuid, p_sku_id uuid)
returns public.store_price
language sql stable security definer set search_path = '' as $$
  select sp.* from public.store_price sp
  where sp.store_id = p_store_id and sp.sku_id = p_sku_id
    and (sp.set_by_owner or sp.approved_at is not null)
    and sp.effective_from <= current_date
    and (sp.effective_to is null or sp.effective_to >= current_date)
  order by sp.effective_from desc, sp.created_at desc
  limit 1
$$;

create or replace function app.current_recommended_price(p_sku_id uuid)
returns numeric
language sql stable security definer set search_path = '' as $$
  select rp.price_per_unit from public.reference_price rp
  where rp.sku_id = p_sku_id and rp.kind = 'recommended'
    and rp.reverses_id is null
    and not exists (select 1 from public.reference_price r2 where r2.reverses_id = rp.id)
  order by rp.observed_date desc, rp.created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Trigger เฉพาะ POS: เติม snapshot ราคา/ต้นทุน แล้วตัดสต๊อก
-- ---------------------------------------------------------------------
create or replace function app.tg_pos_line_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_price   public.store_price;
  v_receipt record;
begin
  select store_id into new.store_id from public.pos_sale where id = new.pos_sale_id;

  v_price := app.current_store_price(new.store_id, new.sku_id);
  if v_price.id is null then
    raise exception 'ยังไม่ได้ตั้งราคาขายของสินค้านี้ในร้าน (sku %)', new.sku_id;
  end if;
  new.store_price_id := v_price.id;
  new.retail_price_per_unit := v_price.retail_price_per_unit;
  new.recommended_price_per_unit := app.current_recommended_price(new.sku_id);

  -- ฝากขาย: ราคาส่ง/ต้นทุนตามที่บันทึกตอนรับเข้าร้านล่าสุด
  select unit_cost, unit_wholesale into v_receipt
  from public.stock_movement
  where store_id = new.store_id and sku_id = new.sku_id and movement_type = 'receipt'
  order by occurred_at desc, created_at desc
  limit 1;
  if not found then
    raise exception 'สินค้านี้ยังไม่ได้รับเข้าร้านแบบฝากขาย (sku %)', new.sku_id;
  end if;
  new.wholesale_per_unit := v_receipt.unit_wholesale;
  new.cost_per_unit := v_receipt.unit_cost;
  return new;
end $$;

create or replace function app.tg_pos_line_to_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.pos_sale;
begin
  select * into v_sale from public.pos_sale where id = new.pos_sale_id;
  insert into public.stock_movement (
    store_id, owner, sku_id, movement_type, qty_units, unit_cost, unit_wholesale,
    source_table, source_id, occurred_at, route, channel_id, actual_actor,
    created_by, actor_type, is_test)
  values (
    new.store_id, 'project_one', new.sku_id, 'sale_pos', -new.qty_units, new.cost_per_unit, new.wholesale_per_unit,
    'pos_sale_line', new.id, v_sale.sold_at, v_sale.route, v_sale.channel_id, v_sale.actual_actor,
    new.created_by, 'system', new.is_test);
  return null;
end $$;

-- ---------------------------------------------------------------------
-- ผูก Trigger
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- is_test บังคับเมื่อ demo_mode
  foreach t in array array['app_user', 'province', 'team', 'store', 'store_assignment', 'product', 'sku', 'barcode',
                           'wholesale_price', 'reference_price', 'store_price', 'pos_sale', 'pos_sale_line',
                           'stock_movement', 'audit_log'] loop
    execute format('create trigger a_force_is_test before insert on public.%I for each row execute function app.tg_force_is_test()', t);
  end loop;

  -- Master: updated_at/by + audit
  foreach t in array array['app_user', 'province', 'team', 'store', 'product', 'sku', 'barcode'] loop
    execute format('create trigger b_touch_updated before update on public.%I for each row execute function app.tg_touch_updated()', t);
    execute format('create trigger z_audit after insert or update on public.%I for each row execute function app.tg_audit()', t);
  end loop;

  -- Versioned: guard + audit
  foreach t in array array['store_assignment', 'wholesale_price', 'store_price'] loop
    execute format('create trigger b_versioned_guard before update or delete on public.%I for each row execute function app.tg_versioned_guard()', t);
    execute format('create trigger z_audit after insert or update on public.%I for each row execute function app.tg_audit()', t);
  end loop;

  -- Ledger / บิล: append-only + audit (ยกเว้น audit_log เอง)
  foreach t in array array['reference_price', 'pos_sale', 'pos_sale_line', 'stock_movement', 'audit_log'] loop
    execute format('create trigger b_append_only before update or delete on public.%I for each row execute function app.tg_append_only()', t);
  end loop;
  foreach t in array array['reference_price', 'pos_sale', 'stock_movement'] loop
    execute format('create trigger z_audit after insert on public.%I for each row execute function app.tg_audit()', t);
  end loop;
end $$;

create trigger c_close_prev after insert on public.store_assignment
  for each row execute function app.tg_versioned_close_prev('store_id');
create trigger c_close_prev after insert on public.wholesale_price
  for each row execute function app.tg_versioned_close_prev('sku_id');
create trigger c_close_prev after insert on public.store_price
  for each row execute function app.tg_versioned_close_prev('store_id', 'sku_id');

create trigger b_fill before insert on public.pos_sale_line
  for each row execute function app.tg_pos_line_fill();
create trigger c_to_stock after insert on public.pos_sale_line
  for each row execute function app.tg_pos_line_to_stock();

-- ---------------------------------------------------------------------
-- View (security_invoker = ใช้ RLS ของผู้เรียก)
-- ---------------------------------------------------------------------
create view public.v_stock_on_hand with (security_invoker = true) as
  select store_id, sku_id, owner, sum(qty_units)::int as qty_on_hand, max(occurred_at) as last_movement_at
  from public.stock_movement
  group by store_id, sku_id, owner;

create view public.v_store_price_current with (security_invoker = true) as
  select distinct on (store_id, sku_id) *
  from public.store_price
  where (set_by_owner or approved_at is not null)
    and effective_from <= current_date
    and (effective_to is null or effective_to >= current_date)
  order by store_id, sku_id, effective_from desc, created_at desc;

-- ---------------------------------------------------------------------
-- Realtime (B1 ทีวี · B2 สต๊อก)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.pos_sale, public.pos_sale_line, public.stock_movement;
