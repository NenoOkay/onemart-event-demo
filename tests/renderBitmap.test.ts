import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutReceipt, fit, PAPER_DOTS, type Measure } from "../src/lib/printing/renderBitmap.ts";
import { buildReceipt } from "../src/lib/printing/receipt.ts";

// วัดแบบสมมติ: 12px ต่อตัวอักษร (ไม่มี canvas ใน node)
const measure: Measure = (t) => [...t].length * 12;

const sale = {
  storeName: "ร้านตัวอย่าง A", billNo: "S-A-261107-101500-AB", soldAt: "2026-11-07T03:15:00Z",
  paymentMethod: "cash" as const, total: 27, cashReceived: 100, change: 73,
  lines: [{ name: "น้ำดื่มชื่อยาวมากเป็นพิเศษสำหรับทดสอบการตัดข้อความ", sizeDesc: "600 มล.", qty: 2, unitPrice: 7, lineTotal: 14 }],
};

test("ทุกข้อความอยู่ในความกว้างกระดาษ 384 จุด", () => {
  const { ops, width } = layoutReceipt(buildReceipt(sale), measure);
  assert.equal(width, PAPER_DOTS);
  for (const o of ops) {
    if (o.op !== "text") continue;
    const w = measure(o.text, o.font);
    const left = o.align === "left" ? o.x : o.align === "right" ? o.x - w : o.x - w / 2;
    assert.ok(left >= 0 && left + w <= width, `ล้นกระดาษ: ${o.text}`);
  }
});

test("หัว = โลโก้กึ่งกลาง ตามด้วย ใบเสร็จสาธิต · feed ไม่ถูกวาดแต่ส่งเป็นจำนวนบรรทัด", () => {
  const { ops, feedLines, height, width } = layoutReceipt(buildReceipt(sale), measure);
  assert.equal(ops[0].op, "image");
  if (ops[0].op === "image") assert.equal(ops[0].x * 2 + ops[0].width, width);
  assert.equal(ops[1].op === "text" && ops[1].text, "ใบเสร็จสาธิต");
  assert.ok(ops[1].y >= (ops[0].op === "image" ? ops[0].y + ops[0].height : 0), "ข้อความไม่ทับโลโก้");
  assert.equal(feedLines, 3);
  assert.ok(height > 0);
});

test("fit ตัดข้อความยาวแล้วต่อ …", () => {
  assert.equal(fit("abc", 100, "", measure), "abc");
  const t = fit("abcdefghij", 60, "", measure);
  assert.ok(t.endsWith("…") && measure(t, "") <= 60);
});
