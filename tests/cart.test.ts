// รัน: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cartReducer, lookupBarcode, cartTotalSatang, cartItemCount, formatBaht, searchCatalog, sanitizeStoredCart,
  type CatalogItem, type BarcodeEntry,
} from "../src/lib/pos/cart.ts";

const water: CatalogItem = { skuId: "w", skuCode: "DM-001", name: "น้ำดื่ม", sizeDesc: "600 มล.", baseUom: "ขวด", price: 7, stock: 24 };
const milk: CatalogItem = { skuId: "m", skuCode: "DM-006", name: "นม UHT รสจืด", sizeDesc: "180 มล.", baseUom: "กล่อง", price: 10.75, stock: 12 };
const catalog = new Map([water, milk].map((i) => [i.skuId, i]));
const barcodes: BarcodeEntry[] = [
  { barcode: "2000000000015", skuId: "w", unitsPerLevel: 1 },
  { barcode: "2000001000014", skuId: "w", unitsPerLevel: 12 },
];

test("เพิ่มสินค้าซ้ำรวมจำนวน และย้ายขึ้นบนสุด", () => {
  let c = cartReducer([], { type: "add", skuId: "w", qty: 1 });
  c = cartReducer(c, { type: "add", skuId: "m", qty: 2 });
  c = cartReducer(c, { type: "add", skuId: "w", qty: 1 });
  assert.deepEqual(c, [{ skuId: "w", qty: 2 }, { skuId: "m", qty: 2 }]);
});

test("ลดจนเหลือ 0 แล้วรายการหายไป", () => {
  let c = cartReducer([], { type: "add", skuId: "w", qty: 1 });
  c = cartReducer(c, { type: "inc", skuId: "w" });
  c = cartReducer(c, { type: "dec", skuId: "w" });
  c = cartReducer(c, { type: "dec", skuId: "w" });
  assert.deepEqual(c, []);
});

test("บาร์โค้ดชิ้น = 1 · แพ็ก = ชิ้นต่อแพ็ก · ไม่พบ = null", () => {
  assert.deepEqual(lookupBarcode(barcodes, " 2000000000015\n"), { skuId: "w", qty: 1 });
  assert.deepEqual(lookupBarcode(barcodes, "2000001000014"), { skuId: "w", qty: 12 });
  assert.equal(lookupBarcode(barcodes, "8850000000000"), null);
  assert.equal(lookupBarcode(barcodes, ""), null);
});

test("ยอดรวมคิดเป็นสตางค์ไม่เพี้ยน", () => {
  const c = [{ skuId: "m", qty: 3 }, { skuId: "w", qty: 2 }];
  assert.equal(cartTotalSatang(c, catalog), 3225 + 1400);
  assert.equal(cartItemCount(c), 5);
  assert.equal(formatBaht(4625), "46.25");
});

test("ค้นหาด้วยชื่อหลายคำ และรหัส", () => {
  assert.deepEqual(searchCatalog([water, milk], "นม จืด").map((i) => i.skuId), ["m"]);
  assert.deepEqual(searchCatalog([water, milk], "dm-001").map((i) => i.skuId), ["w"]);
  assert.deepEqual(searchCatalog([water, milk], "  "), []);
});

test("ตะกร้าในเครื่องที่เสียหรือเก่าถูกกรองออก", () => {
  assert.deepEqual(sanitizeStoredCart([{ skuId: "w", qty: 2 }, { skuId: "x", qty: 1 }, { skuId: "m", qty: 0 }, null], catalog),
    [{ skuId: "w", qty: 2 }]);
  assert.deepEqual(sanitizeStoredCart("bad", catalog), []);
});
