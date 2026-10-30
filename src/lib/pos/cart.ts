// ตะกร้า POS (P2) — ฟังก์ชันล้วน ไม่มี import เพื่อทดสอบด้วย node --test ได้
// เงินคำนวณเป็นสตางค์ (จำนวนเต็ม) กันทศนิยมเพี้ยน · ราคาจริงในบิลฐานข้อมูลเติมเองตอนบันทึก (P3)

export type CatalogItem = {
  skuId: string;
  skuCode: string;
  name: string;
  sizeDesc: string;
  baseUom: string;
  price: number; // ราคาขายของร้าน ต่อชิ้น (บาท)
  stock: number; // คงเหลือในระบบ (ชิ้น)
};

export type BarcodeEntry = { barcode: string; skuId: string; unitsPerLevel: number };

export type CartLine = { skuId: string; qty: number };

export type CartAction =
  | { type: "add"; skuId: string; qty: number }
  | { type: "inc"; skuId: string }
  | { type: "dec"; skuId: string }
  | { type: "remove"; skuId: string }
  | { type: "clear" }
  | { type: "replace"; lines: CartLine[] };

// รายการที่เพิ่ม/สแกนล่าสุดอยู่บนสุด
export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      if (action.qty <= 0) return lines;
      const found = lines.find((l) => l.skuId === action.skuId);
      const rest = lines.filter((l) => l.skuId !== action.skuId);
      return [{ skuId: action.skuId, qty: (found?.qty ?? 0) + action.qty }, ...rest];
    }
    case "inc":
      return lines.map((l) => (l.skuId === action.skuId ? { ...l, qty: l.qty + 1 } : l));
    case "dec":
      return lines
        .map((l) => (l.skuId === action.skuId ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0);
    case "remove":
      return lines.filter((l) => l.skuId !== action.skuId);
    case "clear":
      return [];
    case "replace":
      return action.lines;
  }
}

// สแกน 1 ครั้ง = จำนวนชิ้นตามระดับบาร์โค้ด (ชิ้น = 1 · แพ็ก = ชิ้นต่อแพ็ก)
export function lookupBarcode(barcodes: BarcodeEntry[], raw: string): { skuId: string; qty: number } | null {
  const code = raw.replace(/\s+/g, "");
  if (!code) return null;
  const hit = barcodes.find((b) => b.barcode === code);
  return hit ? { skuId: hit.skuId, qty: hit.unitsPerLevel } : null;
}

export const toSatang = (baht: number) => Math.round(baht * 100);

export function lineTotalSatang(line: CartLine, item: CatalogItem | undefined): number {
  return item ? toSatang(item.price) * line.qty : 0;
}

export function cartTotalSatang(lines: CartLine[], catalog: Map<string, CatalogItem>): number {
  return lines.reduce((sum, l) => sum + lineTotalSatang(l, catalog.get(l.skuId)), 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function formatBaht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ค้นหาชื่อ/รหัส (ไม่สนตัวพิมพ์ · ช่องว่างหลายคำ = ต้องมีทุกคำ)
export function searchCatalog(items: CatalogItem[], query: string, limit = 20): CatalogItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items
    .filter((it) => {
      const hay = `${it.name} ${it.sizeDesc} ${it.skuCode}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

// ตะกร้าที่เก็บไว้ในเครื่องอาจเก่า — ตัดสินค้าที่ไม่มีในแคตตาล็อกแล้วออก
export function sanitizeStoredCart(value: unknown, catalog: Map<string, CatalogItem>): CartLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (l): l is CartLine =>
      !!l && typeof l.skuId === "string" && catalog.has(l.skuId) && Number.isInteger(l.qty) && l.qty > 0,
  );
}
