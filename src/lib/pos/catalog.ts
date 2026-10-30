import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarcodeEntry, CatalogItem } from "./cart";

export type PosContext = {
  store: { id: string; code: string; name: string };
  ownerName: string;
  items: CatalogItem[];
  barcodes: BarcodeEntry[];
  bestSkuIds: string[]; // ปุ่มลัด 8 สินค้าขายดี 7 วัน
};

// โหลดข้อมูลหน้าขายของร้านเจ้าของบัญชีที่ login (RLS จำกัดให้เห็นเฉพาะร้านตน)
export async function loadPosContext(supabase: SupabaseClient, authUserId: string): Promise<PosContext | null> {
  const { data: me } = await supabase
    .from("app_user").select("id, full_name, role").eq("auth_user_id", authUserId).single();
  if (!me || me.role !== "store_owner") return null;

  const { data: store } = await supabase
    .from("store").select("id, code, name").eq("owner_user_id", me.id).single();
  if (!store) return null;

  const [skus, barcodes, prices, stock, best] = await Promise.all([
    supabase.from("sku").select("id, sku_code, size_desc, base_uom, product:product_id (name_th)").eq("status", "active"),
    supabase.from("barcode").select("barcode, sku_id, units_per_level"),
    supabase.from("v_store_price_current").select("sku_id, retail_price_per_unit").eq("store_id", store.id),
    supabase.from("v_stock_on_hand").select("sku_id, qty_on_hand").eq("store_id", store.id),
    supabase.from("v_best_seller_7d").select("sku_id, qty_7d").eq("store_id", store.id).order("qty_7d", { ascending: false }).limit(8),
  ]);
  for (const r of [skus, barcodes, prices, stock, best]) if (r.error) throw new Error(r.error.message);

  const priceBySku = new Map(prices.data!.map((p) => [p.sku_id, Number(p.retail_price_per_unit)]));
  const stockBySku = new Map(stock.data!.map((s) => [s.sku_id, Number(s.qty_on_hand)]));

  // ขายได้เฉพาะสินค้าที่ร้านตั้งราคาแล้ว
  const items: CatalogItem[] = skus.data!
    .filter((s) => priceBySku.has(s.id))
    .map((s) => ({
      skuId: s.id,
      skuCode: s.sku_code,
      name: (s.product as unknown as { name_th: string } | null)?.name_th ?? s.sku_code,
      sizeDesc: s.size_desc,
      baseUom: s.base_uom,
      price: priceBySku.get(s.id)!,
      stock: stockBySku.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode));

  const sellable = new Set(items.map((i) => i.skuId));
  const bestSkuIds = best.data!.map((b) => b.sku_id).filter((id) => sellable.has(id));
  for (const it of items) if (bestSkuIds.length < 8 && !bestSkuIds.includes(it.skuId)) bestSkuIds.push(it.skuId);

  return {
    store,
    ownerName: me.full_name,
    items,
    barcodes: barcodes.data!
      .filter((b) => sellable.has(b.sku_id))
      .map((b) => ({ barcode: b.barcode, skuId: b.sku_id, unitsPerLevel: b.units_per_level })),
    bestSkuIds,
  };
}
