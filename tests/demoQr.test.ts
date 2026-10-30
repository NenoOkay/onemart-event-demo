import { test } from "node:test";
import assert from "node:assert/strict";
import zx from "@zxing/library";
import { demoQrModules, demoQrSvg, DEMO_QR_SIZE } from "../src/lib/pos/demoQr.ts";

const { QRCodeReader, QRCodeWriter, BarcodeFormat, MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, DecodeHintType } = zx;

function bitmap(scale = 8, m: boolean[][] = demoQrModules()) {
  const quiet = 4, n = m.length + quiet * 2, W = n * scale;
  const lum = new Uint8ClampedArray(W * W).fill(255);
  m.forEach((row, r) => row.forEach((on, c) => {
    if (!on) return;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++)
      lum[((r + quiet) * scale + y) * W + (c + quiet) * scale + x] = 0;
  }));
  return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, W, W)));
}

test("ชุดเทียบ: วิธีทดสอบเดียวกันถอด QR จริงได้", () => {
  const bm = new QRCodeWriter().encode("TEST-CONTROL", BarcodeFormat.QR_CODE, 25, 25, new Map());
  const m = Array.from({ length: bm.getHeight() }, (_, y) => Array.from({ length: bm.getWidth() }, (_, x) => bm.get(x, y)));
  assert.equal(new QRCodeReader().decode(bitmap(8, m)).getText(), "TEST-CONTROL");
});

test("QR ตัวอย่างถอดรหัสไม่ได้ (QR reader + ทุกรูปแบบ + TRY_HARDER)", () => {
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  for (const scale of [4, 8, 12]) {
    assert.throws(() => new QRCodeReader().decode(bitmap(scale), hints), undefined, `scale ${scale} ถอดได้`);
    const multi = new MultiFormatReader();
    multi.setHints(hints);
    assert.throws(() => multi.decode(bitmap(scale)), undefined, `scale ${scale} ถอดได้ (multi)`);
  }
});

test("ลายคงที่ทุกครั้ง และ SVG ไม่มีข้อความ PromptPay ID", () => {
  assert.deepEqual(demoQrModules(), demoQrModules());
  assert.equal(demoQrModules().length, DEMO_QR_SIZE);
  const svg = demoQrSvg();
  assert.ok(svg.startsWith("<svg") && !/\d{10,}/.test(svg.replace(/[\d.]+"/g, "")));
});
