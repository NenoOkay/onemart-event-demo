-- =====================================================================
-- ONE MART · Event Demo · วันที่ 4 — P3 บันทึกบิล
-- create_pos_sale(): หัวบิล + รายการใน transaction เดียว
--   · ยอดเงินคิดจากราคาร้านในฐานข้อมูล (แอปส่งมาแค่ SKU + จำนวน)
--   · security invoker → RLS ของผู้เรียกบังคับ: เจ้าของร้านบันทึกได้เฉพาะร้านตน
--   · ส่ง external_txn_id เดิมซ้ำ (เน็ตหลุดแล้วกดใหม่) → คืนบิลเดิม ไม่สร้างซ้ำ
-- =====================================================================

create or replace function public.create_pos_sale(
  p_store_id        uuid,
  p_external_txn_id text,
  p_payment_method  text,
  p_cash_received   numeric,
  p_lines           jsonb   -- [{ "sku_id": uuid, "qty": int, "barcode": text|null }]
)
returns table (sale_id uuid, total_amount numeric, change_amount numeric, created boolean)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_sale   public.pos_sale;
  v_total  numeric(12, 2) := 0;
  v_change numeric(12, 2);
  v_line   record;
  v_price  public.store_price;
  v_id     uuid;
  v_items  jsonb;
begin
  if p_external_txn_id is null or length(p_external_txn_id) not between 8 and 64 then
    raise exception 'เลขที่บิลไม่ถูกต้อง';
  end if;

  -- ส่งซ้ำ → คืนบิลเดิม
  select * into v_sale from public.pos_sale s
  where s.source_system = 'onemart_pos' and s.external_txn_id = p_external_txn_id;
  if found then
    return query select v_sale.id, v_sale.total_amount, v_sale.change_amount, false;
    return;
  end if;

  if p_payment_method not in ('cash', 'promptpay_demo') then
    raise exception 'วิธีชำระเงินไม่ถูกต้อง';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'ไม่มีสินค้าในบิล';
  end if;

  -- รวมรายการ SKU ซ้ำ + คิดยอดจากราคาร้านปัจจุบัน
  select jsonb_agg(jsonb_build_object('sku_id', x.sku_id, 'qty', x.qty, 'barcode', x.barcode)) into v_items
  from (select (e ->> 'sku_id')::uuid as sku_id, sum((e ->> 'qty')::int)::int as qty, max(e ->> 'barcode') as barcode
        from jsonb_array_elements(p_lines) e group by 1) x;

  for v_line in select (i ->> 'sku_id')::uuid as sku_id, (i ->> 'qty')::int as qty, i ->> 'barcode' as barcode
                from jsonb_array_elements(v_items) i loop
    if v_line.sku_id is null or v_line.qty is null or v_line.qty <= 0 then
      raise exception 'รายการสินค้าไม่ถูกต้อง';
    end if;
    v_price := app.current_store_price(p_store_id, v_line.sku_id);
    if v_price.id is null then
      raise exception 'ยังไม่ได้ตั้งราคาขายของสินค้านี้ในร้าน';
    end if;
    v_total := v_total + v_line.qty * v_price.retail_price_per_unit;
  end loop;

  if p_payment_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then
      raise exception 'รับเงินไม่พอ: ยอด % บาท', v_total;
    end if;
    v_change := p_cash_received - v_total;
  end if;

  begin
    insert into public.pos_sale (store_id, external_txn_id, source_system, payment_method,
                                 total_amount, cash_received, change_amount)
    values (p_store_id, p_external_txn_id, 'onemart_pos', p_payment_method, v_total,
            case when p_payment_method = 'cash' then p_cash_received end, v_change)
    returning id into v_id;
  exception when unique_violation then
    -- ส่งซ้ำพร้อมกัน 2 ครั้ง → คืนบิลที่บันทึกก่อน
    select * into v_sale from public.pos_sale s
    where s.source_system = 'onemart_pos' and s.external_txn_id = p_external_txn_id;
    return query select v_sale.id, v_sale.total_amount, v_sale.change_amount, false;
    return;
  end;

  -- ราคา/ต้นทุนจริงของแต่ละบรรทัด trigger เติมเอง (tg_pos_line_fill) · ตัดสต๊อกโดย trigger
  for v_line in select (i ->> 'sku_id')::uuid as sku_id, (i ->> 'qty')::int as qty, i ->> 'barcode' as barcode
                from jsonb_array_elements(v_items) i loop
    v_price := app.current_store_price(p_store_id, v_line.sku_id);
    insert into public.pos_sale_line (pos_sale_id, store_id, sku_id, barcode_scanned, qty_units,
                                      retail_price_per_unit, store_price_id, wholesale_per_unit, cost_per_unit)
    values (v_id, p_store_id, v_line.sku_id, v_line.barcode, v_line.qty,
            v_price.retail_price_per_unit, v_price.id, 0, 0);
  end loop;

  return query select v_id, v_total, v_change, true;
end $$;

revoke all on function public.create_pos_sale(uuid, text, text, numeric, jsonb) from public, anon;
grant execute on function public.create_pos_sale(uuid, text, text, numeric, jsonb) to authenticated;
