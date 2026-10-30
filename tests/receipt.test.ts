import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayWidth, truncate, padRow, formatThaiDateTime, buildReceipt, renderText, receiptHtml, RECEIPT_WIDTH,
  type ReceiptSale,
} from "../src/lib/printing/receipt.ts";

const sale: ReceiptSale = {
  storeName: "ร้านตัวอย่าง A",
  billNo: "S-A-261030-142305-7K",
  soldAt: "2026-10-30T07:23:05Z", // = 14:23 เวลาไทย
  paymentMethod: "cash",
  total: 31,
  cashReceived: 100,
  change: 69,
  lines: [
    { name: "น้ำดื่ม", sizeDesc: "600 มล.", qty: 2, unitPrice: 7, lineTotal: 14 },
    { name: "นม UHT รสช็อกโกแลต", sizeDesc: "180 มล.", qty: 1, unitPrice: 13, lineTotal: 13 },
    { name: "แชมพู ชนิดซอง", sizeDesc: "10 มล.", qty: 1, unitPrice: 4, lineTotal: 4 },
  ],
};

test("ความกว้างภาษาไทยไม่นับสระบน-ล่างและวรรณยุกต์", () => {
  assert.equal(displayWidth("น้ำดื่ม"), 4); // น ำ ด ม (้ ื ่ ไม่กินที่)
  assert.equal(displayWidth("ใบเสร็จสาธิต"), 10);
  assert.equal(displayWidth("abc"), 3);
});

test("ตัดข้อความยาวแล้วเติม … ไม่เกินความกว้าง", () => {
  const t = truncate("บะหมี่กึ่งสำเร็จรูป รสต้มยำ 55 กรัม ขนาดพิเศษ", 20);
  assert.ok(displayWidth(t) <= 20);
  assert.ok(t.endsWith("…"));
  assert.equal(truncate("สั้น", 20), "สั้น");
});

test("แถวซ้าย-ขวากว้างพอดี 32", () => {
  assert.equal(displayWidth(padRow("  2 x 7.00", "14.00")), RECEIPT_WIDTH);
  assert.equal(displayWidth(padRow("ผลิตภัณฑ์ชื่อยาวมากจนล้นบรรทัดแน่นอน", "1,234.00")), RECEIPT_WIDTH);
});

test("วันเวลาเป็นเวลาไทย ปี พ.ศ.", () => {
  assert.equal(formatThaiDateTime("2026-10-30T07:23:05Z"), "30/10/2569 14:23");
  assert.equal(formatThaiDateTime("2026-10-30T18:30:00Z"), "31/10/2569 01:30");
});

test("ใบเสร็จมีหัว 'ใบเสร็จสาธิต' · ยอด · ทอน · ไม่ใช่ใบกำกับภาษี · ไม่มี VAT", () => {
  const text = renderText(buildReceipt(sale));
  assert.ok(text[0].includes("ใบเสร็จสาธิต"));
  assert.ok(text.some((l) => l.includes("ข้อมูลจำลองเพื่อการสาธิต")));
  assert.ok(text.some((l) => l.startsWith("รวม 4 ชิ้น") && l.endsWith("31.00")));
  assert.ok(text.some((l) => l.startsWith("เงินทอน") && l.endsWith("69.00")));
  assert.ok(text.some((l) => l.includes("ไม่ใช่ใบกำกับภาษี")));
  assert.ok(!text.some((l) => /vat|ภาษีมูลค่าเพิ่ม/i.test(l)));
  for (const l of text) assert.ok(displayWidth(l) <= RECEIPT_WIDTH, `ล้นบรรทัด: ${l}`);
});

test("PromptPay แสดงว่าเป็นการสาธิต ไม่มีบรรทัดเงินทอน", () => {
  const text = renderText(buildReceipt({ ...sale, paymentMethod: "promptpay_demo", cashReceived: null, change: null }));
  assert.ok(text.some((l) => l.includes("PromptPay (สาธิต)")));
  assert.ok(!text.some((l) => l.startsWith("เงินทอน")));
});

test("HTML ใบเสร็จ escape ข้อความ", () => {
  const html = receiptHtml(buildReceipt({ ...sale, storeName: "<b>ร้าน</b>" }));
  assert.ok(html.includes("&lt;b&gt;ร้าน&lt;/b&gt;"));
  assert.ok(!html.includes("<b>ร้าน"));
});
