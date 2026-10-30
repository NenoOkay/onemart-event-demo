// สร้างแผ่นบาร์โค้ดทดสอบ (EAN-13) จาก sku-prices.csv สำหรับพิมพ์หรือเปิดบนจอให้มือถือสแกน
// รัน: npm run barcodes   → scripts/barcode-sheet.html
// บาร์โค้ดขึ้นต้น 200 เป็นรหัสชั่วคราว ไม่มีบนสินค้าจริง
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// ---- EAN-13 → SVG ----
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join("")); // R = กลับบิตของ L
const G = R.map((p) => [...p].reverse().join("")); // G = R อ่านกลับหลัง
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function checkDigit(body12: string): number {
  const sum = [...body12].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

function ean13Bits(code: string): string {
  if (!/^\d{13}$/.test(code) || checkDigit(code.slice(0, 12)) !== Number(code[12])) throw new Error(`EAN-13 ไม่ถูกต้อง: ${code}`);
  const parity = PARITY[Number(code[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(code[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(code[i])];
  return bits + "101";
}

function ean13Svg(code: string): string {
  const bits = ean13Bits(code);
  const m = 2, quiet = 11, h = 70;
  const width = (bits.length + quiet * 2) * m;
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let rects = "";
  [...bits].forEach((b, i) => {
    if (b === "1") rects += `<rect x="${(quiet + i) * m}" y="0" width="${m}" height="${guard.has(i) ? h + 8 : h}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h + 22}" width="${width}" height="${h + 22}">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g>` +
    `<text x="${width / 2}" y="${h + 20}" text-anchor="middle" font-family="monospace" font-size="14">${code}</text></svg>`;
}

// ---- อ่านสินค้า ----
const [head, ...rows] = readFileSync(here("./seed/sku-prices.csv"), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
const cols = head.split(",");
const items = rows.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));

const cards: string[] = [];
items.forEach((r, i) => {
  cards.push(card(`${r.name_th} ${r.size_desc}`, `ชิ้น · 1 ${r.base_uom}`, r.barcode_unit));
  const units = Number(r.units_per_pack);
  if (units > 1) {
    const body = `2000001${String(i + 1).padStart(5, "0")}`;
    cards.push(card(`${r.name_th} ${r.size_desc}`, `แพ็ก · ${units} ${r.base_uom}`, body + checkDigit(body)));
  }
});

function card(name: string, level: string, code: string): string {
  return `<div class="card"><div class="name">${name}</div><div class="level">${level}</div>${ean13Svg(code)}</div>`;
}

const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>แผ่นบาร์โค้ดทดสอบ</title>
<style>
  body { font-family: sans-serif; margin: 12px; }
  .banner { background: #fbbf24; text-align: center; font-weight: 600; padding: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 10px; }
  .card { border: 1px solid #ccc; border-radius: 6px; padding: 6px; break-inside: avoid; text-align: center; }
  .name { font-weight: 600; font-size: 14px; } .level { font-size: 12px; color: #555; }
  svg { max-width: 100%; height: auto; }
</style></head><body>
<div class="banner">ข้อมูลจำลองเพื่อการสาธิต · บาร์โค้ดชั่วคราว (ขึ้นต้น 200) ไม่มีบนสินค้าจริง</div>
<div class="grid">${cards.join("\n")}</div>
</body></html>`;

writeFileSync(here("./barcode-sheet.html"), html);
console.log(`✓ บาร์โค้ด ${cards.length} รหัส → scripts/barcode-sheet.html`);
