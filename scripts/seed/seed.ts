// Seed ข้อมูลจำลองเพื่อการสาธิต ลง Supabase Event Project
// รัน: npm run seed   (ต้องมี SUPABASE_SECRET_KEY ใน .env.local)
// ตรวจก่อนโดยไม่เขียนอะไรลงฐานข้อมูล: npm run seed -- --dry-run
// รันได้ครั้งเดียว — Ledger ลบไม่ได้ ถ้าต้องเริ่มใหม่ให้ถาม Nukie ก่อนล้างฐานข้อมูล
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomInt, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ownerEmail, staffEmail, pinToPassword } from "../../src/lib/auth/demo-pin.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
process.loadEnvFile(here("../../.env.local"));

const DRY = process.argv.includes("--dry-run");
if (DRY) console.log("DRY RUN — ไม่เชื่อมต่อและไม่เขียนข้อมูลใด ๆ");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!DRY && (!url || !secret)) throw new Error("ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SECRET_KEY ใน .env.local");

const db = createClient(url ?? "http://dry-run.invalid", secret ?? "dry-run", { auth: { persistSession: false, autoRefreshToken: false } });
const demo = JSON.parse(readFileSync(here("./demo-data.json"), "utf8"));
const CRED_FILE = here("../.demo-credentials.json");

// ---------- ตัวช่วย ----------
type Row = Record<string, unknown>;

async function insert(table: string, rows: Row[], chunk = 200): Promise<void> {
  if (DRY) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// สุ่มแบบกำหนด seed ได้ เพื่อให้ข้อมูลเหมือนเดิมทุกครั้งที่สร้างใหม่
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(demo.history.random_seed);
const between = ([lo, hi]: number[]) => lo + Math.floor(rand() * (hi - lo + 1));

// วันที่ตามเวลาไทย (+07:00)
const BKK = 7 * 3600_000;
const bkkDate = (offsetDays: number) => new Date(Date.now() + BKK + offsetDays * 86400_000).toISOString().slice(0, 10);
const bkkTime = (date: string, minutes: number) =>
  new Date(`${date}T00:00:00+07:00`).getTime() + minutes * 60_000;

function readCsv(path: string): Row[] {
  const [head, ...lines] = readFileSync(path, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

// ---------- 0. กันรันซ้ำ ----------
// ทำต่อได้เฉพาะกรณีรอบก่อนล้มหลังสร้าง Master (ผู้ใช้ ร้าน SKU) แต่ก่อนบาร์โค้ด — ยังไม่มี Ledger ใดถูกเขียน
async function count(table: string): Promise<number> {
  if (DRY) return 0;
  const { count: n, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}
const RESUME = (await count("store")) > 0;
if (RESUME && ((await count("barcode")) > 0 || (await count("stock_movement")) > 0 || !existsSync(CRED_FILE))) {
  console.log("มีข้อมูลเดโมอยู่แล้ว — หยุด (Ledger ลบไม่ได้ ห้าม seed ซ้ำ)");
  process.exit(1);
}
if (RESUME) console.log("ทำต่อจากรอบก่อน (ใช้ผู้ใช้ ร้าน SKU ที่สร้างไว้แล้ว)");

async function idsByCode(table: string, codeCol: string): Promise<Record<string, string>> {
  const { data, error } = await db.from(table).select(`id, ${codeCol}`);
  if (error) throw new Error(`${table}: ${error.message}`);
  return Object.fromEntries((data as unknown as Row[]).map((r) => [String(r[codeCol]), String(r.id)]));
}

// ---------- 1. บัญชีผู้ใช้ (Supabase Auth) ----------
type Cred = { key: string; role: string; email: string; password: string; store_code?: string; pin?: string };
const creds: Cred[] = [];

async function ensureAuthUser(email: string, password: string): Promise<string> {
  if (DRY) return randomUUID();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error) return data.user.id;
  // รอบก่อนสร้างบัญชีไว้แล้วแต่ล้มกลางทาง → ใช้บัญชีเดิม และตั้งรหัสผ่านใหม่
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users.find((u) => u.email === email);
  if (!found) throw new Error(`สร้างผู้ใช้ ${email} ไม่ได้: ${error.message}`);
  await db.auth.admin.updateUserById(found.id, { password });
  return found.id;
}

const userId: Record<string, string> = {};
const appUsers: Row[] = [];
if (RESUME) {
  const saved: Cred[] = JSON.parse(readFileSync(CRED_FILE, "utf8"));
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const byAuth = await idsByCode("app_user", "auth_user_id");
  for (const c of saved) {
    const authId = list?.users.find((u) => u.email === c.email)?.id;
    if (!authId || !byAuth[authId]) throw new Error(`ไม่พบผู้ใช้เดิม ${c.email}`);
    userId[c.key] = byAuth[authId];
    creds.push(c);
  }
} else {
for (const s of demo.staff) {
  const email = staffEmail(s.key);
  const password = randomBytes(12).toString("base64url");
  const authId = await ensureAuthUser(email, password);
  userId[s.key] = randomUUID();
  appUsers.push({ id: userId[s.key], auth_user_id: authId, full_name: s.full_name, role: s.role, contractor_type: s.contractor_type ?? null });
  creds.push({ key: s.key, role: s.role, email, password });
}
for (const st of demo.stores) {
  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  const email = ownerEmail(st.code);
  const authId = await ensureAuthUser(email, pinToPassword(st.code, pin));
  const key = `owner-${st.code}`;
  userId[key] = randomUUID();
  appUsers.push({ id: userId[key], auth_user_id: authId, full_name: st.owner_name, role: "store_owner" });
  creds.push({ key, role: "store_owner", email, password: pinToPassword(st.code, pin), store_code: st.code, pin });
}
if (!DRY) writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
}
console.log(`✓ บัญชีผู้ใช้ ${creds.length} บัญชี → scripts/.demo-credentials.json (ไม่ขึ้น git)`);

const admin = userId.admin;
if (!RESUME) {
  await insert("app_user", [{ ...appUsers[0], created_by: admin }]);
  await insert("app_user", appUsers.slice(1).map((u) => ({ ...u, created_by: admin })));
}

// ---------- 2. จังหวัด ทีม ร้าน ผู้ดูแลร้าน ----------
const started = bkkDate(-30);
const storeId: Record<string, string> = RESUME ? await idsByCode("store", "code") : {};
if (!RESUME) {
const provinceId = randomUUID();
const teamId = randomUUID();
await insert("province", [{ id: provinceId, ...demo.province, pilot_status: "active", created_by: admin }]);
await insert("team", [{ id: teamId, province_id: provinceId, ...demo.team, status: "active", created_by: admin }]);

await insert("store", demo.stores.map((st: Row & { code: string }) => {
  storeId[st.code] = randomUUID();
  return {
    id: storeId[st.code], team_id: teamId, province_id: provinceId, code: st.code, name: st.name,
    owner_user_id: userId[`owner-${st.code}`], owner_name: st.owner_name,
    lifecycle_status: "opened", opened_at: bkkDate(-8), selected_by: userId["manager-1"], created_by: admin,
  };
}));
await insert("store_assignment", demo.stores.map((st: Row & { code: string; promoter: string }) => ({
  store_id: storeId[st.code], promoter_user_id: userId[st.promoter], manager_user_id: userId["manager-1"],
  effective_from: started, created_by: admin, approved_by: userId.executive, approved_at: new Date().toISOString(),
})));
}
console.log(`✓ ร้าน ${demo.stores.length} ร้าน`);

// ---------- 3. สินค้า บาร์โค้ด ราคา ----------
type Sku = { id: string; code: string; units: number; rec: number; ws: number; cost: number; openingUnits: number };
const skus: Sku[] = [];
const products: Row[] = [], skuRows: Row[] = [], barcodes: Row[] = [], wholesale: Row[] = [], refs: Row[] = [];
const existingSku = RESUME ? await idsByCode("sku", "sku_code") : {};
readCsv(here("./sku-prices.csv")).forEach((r, i) => {
  const productId = randomUUID(), id = existingSku[String(r.sku_code)] ?? randomUUID();
  if (RESUME && !existingSku[String(r.sku_code)]) throw new Error(`ไม่พบ SKU เดิม ${r.sku_code}`);
  const units = Number(r.units_per_pack);
  products.push({ id: productId, name_th: r.name_th, category: r.category, created_by: admin });
  skuRows.push({
    id, product_id: productId, sku_code: r.sku_code, size_desc: r.size_desc, base_uom: r.base_uom, pack_uom: r.pack_uom,
    units_per_pack: units, single_unit_sellable: true, vat_type: "unknown", created_by: admin,
  });
  barcodes.push({ sku_id: id, barcode: r.barcode_unit, level: "unit", units_per_level: 1, verified_from_product: false, created_by: admin });
  if (units > 1) {
    // บาร์โค้ดระดับแพ็กชั่วคราว (PL2-11) · ขึ้นต้น 2000001
    const body = `2000001${String(i + 1).padStart(5, "0")}`;
    const sum = [...body].reduce((a, d, k) => a + Number(d) * (k % 2 ? 3 : 1), 0);
    barcodes.push({ sku_id: id, barcode: body + ((10 - (sum % 10)) % 10), level: "pack", units_per_level: units, verified_from_product: false, created_by: admin });
  }
  wholesale.push({ sku_id: id, price_per_unit: Number(r.wholesale_per_unit), price_includes_vat: null,
    source_note: r.note, effective_from: started, created_by: admin });
  refs.push({ sku_id: id, kind: "recommended", price_per_unit: Number(r.recommended_price), observed_date: bkkDate(-8), created_by: admin });
  refs.push({ sku_id: id, kind: "seven_eleven", price_per_unit: Number(r.seven_eleven_price), observed_date: bkkDate(-8), created_by: admin });
  skus.push({ id, code: String(r.sku_code), units, rec: Number(r.recommended_price), ws: Number(r.wholesale_per_unit),
    cost: Number(r.cost_per_unit), openingUnits: Number(r.opening_packs_per_store) * units });
});
if (!RESUME) {
  await insert("product", products);
  await insert("sku", skuRows);
}
await insert("barcode", barcodes);
await insert("wholesale_price", wholesale);
await insert("reference_price", refs);

// ราคาร้าน = ราคาแนะนำ ตั้งโดยเจ้าของร้าน (เดโม P5 จะแก้ราคาหน้างาน)
await insert("store_price", demo.stores.flatMap((st: { code: string }) => skus.map((k) => ({
  store_id: storeId[st.code], sku_id: k.id, retail_price_per_unit: k.rec, price_includes_vat: null,
  set_by_owner: true, effective_from: started, created_by: userId[`owner-${st.code}`],
}))));
console.log(`✓ SKU ${skus.length} รายการ · บาร์โค้ด ${barcodes.length} · ราคา`);

// ---------- 4. รับเข้าฝากขาย + ขายย้อนหลัง + เติมเท่าที่ขาย ----------
const receipts: Row[] = [], sales: Row[] = [], lines: Row[] = [];
const onHand: Record<string, number> = {};
const receive = (store: string, k: Sku, qty: number, at: number, reason: string | null) => {
  onHand[`${store}|${k.id}`] = (onHand[`${store}|${k.id}`] ?? 0) + qty;
  receipts.push({
    store_id: storeId[store], owner: "project_one", sku_id: k.id, movement_type: "receipt", qty_units: qty,
    unit_cost: k.cost, unit_wholesale: k.ws, source_table: "seed_receipt", source_id: randomUUID(),
    occurred_at: new Date(at).toISOString(), created_by: admin, actor_type: "system", reason,
  });
};

const days = demo.history.days_back;
for (const st of demo.stores as { code: string }[]) {
  for (const k of skus) receive(st.code, k, k.openingUnits, bkkTime(bkkDate(-days - 1), 9 * 60), "รับเข้าฝากขายครั้งแรก (ข้อมูลจำลอง)");
}

for (let d = -days; d <= 0; d++) {
  const date = bkkDate(d);
  const nowMin = d === 0 ? Math.floor(((Date.now() + BKK) % 86400_000) / 60_000) : 20 * 60;
  for (const st of demo.stores as { code: string }[]) {
    // เติมเท่าที่ขาย: ต้นวัน ถ้าเหลือ < 30% ของชุดแรก เติมกลับเท่าจำนวนแพ็กที่ขายไป
    if (d > -days && d < 0) {
      for (const k of skus) {
        const left = onHand[`${st.code}|${k.id}`];
        if (left < k.openingUnits * 0.3) {
          const packs = Math.floor((k.openingUnits - left) / k.units);
          if (packs > 0) receive(st.code, k, packs * k.units, bkkTime(date, 8 * 60), "เติมเท่าที่ขาย (ข้อมูลจำลอง)");
        }
      }
    }
    const n = between(d === 0 ? demo.history.bills_today_per_store : demo.history.bills_per_store_per_day);
    const endMin = Math.min(nowMin - 5, 20 * 60);
    if (endMin <= 7 * 60) continue;
    const times = Array.from({ length: n }, () => between([7 * 60, endMin])).sort((a, b) => a - b);
    times.forEach((min, i) => {
      const saleId = randomUUID();
      let total = 0;
      const picked = new Set<string>();
      for (let j = between(demo.history.lines_per_bill); j > 0; j--) {
        const k = skus[Math.floor(rand() ** 1.6 * skus.length)]; // สินค้าต้นรายการขายบ่อยกว่า
        const qty = between(demo.history.qty_per_line);
        const key = `${st.code}|${k.id}`;
        if (picked.has(k.id) || onHand[key] < qty) continue;
        picked.add(k.id);
        onHand[key] -= qty;
        total += qty * k.rec;
        lines.push({ pos_sale_id: saleId, store_id: storeId[st.code], sku_id: k.id, qty_units: qty,
          retail_price_per_unit: 0, store_price_id: saleId, wholesale_per_unit: 0, cost_per_unit: 0, // trigger เติมค่าจริง
          created_by: userId[`owner-${st.code}`] });
      }
      if (!picked.size) return;
      const cash = rand() >= demo.history.promptpay_share;
      const received = cash ? Math.ceil(total / 20) * 20 + (rand() < 0.4 ? 100 : 0) : null;
      sales.push({
        id: saleId, store_id: storeId[st.code], external_txn_id: `seed-${st.code}-${date}-${i + 1}`, source_system: "seed",
        sold_at: new Date(bkkTime(date, min)).toISOString(), payment_method: cash ? "cash" : "promptpay_demo",
        total_amount: total.toFixed(2), cash_received: received, change_amount: cash ? (received! - total).toFixed(2) : null,
        created_by: userId[`owner-${st.code}`], actor_type: "system",
      });
    });
  }
}
await insert("stock_movement", receipts);
await insert("pos_sale", sales);
await insert("pos_sale_line", lines);
console.log(`✓ รับเข้า ${receipts.length} รายการ · บิล ${sales.length} ใบ · บรรทัด ${lines.length}`);

// ---------- 5. ตรวจยอดหลัง seed ----------
const localNeg = Object.values(onHand).filter((q) => q < 0).length;
const salesTotal = sales.reduce((a, s) => a + Number(s.total_amount), 0);
console.log(`  ยอดขายปลีกจำลองรวม ${salesTotal.toFixed(2)} บาท · สต๊อกติดลบ (คำนวณในเครื่อง) ${localNeg} รายการ`);
if (DRY) process.exit(0);
const { data: soh } = await db.from("v_stock_on_hand").select("qty_on_hand");
const neg = (soh ?? []).filter((r) => r.qty_on_hand < 0).length;
console.log(neg ? `⚠ สต๊อกติดลบ ${neg} รายการ` : "✓ สต๊อกไม่ติดลบ");
console.log(existsSync(CRED_FILE) ? "เสร็จ" : "⚠ ไม่พบไฟล์บัญชีเดโม");
