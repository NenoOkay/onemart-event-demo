// ทดสอบ Migration + RLS บน PGlite (Postgres ในหน่วยความจำ · จำลอง auth ของ Supabase · ไม่ต้องใช้ Docker)
// รัน: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migDir = process.argv[2] ?? fileURLToPath(new URL("../migrations", import.meta.url));
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

process.on("unhandledRejection", (e) => { console.log("ERROR:", e.message, e.where ?? ""); process.exit(2); });
for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migDir, f), "utf8"));
  console.log("✓ migration", f);
}

// ---- seed (superuser = ข้ามการตรวจ RLS เหมือน service role) ----
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  insert into auth.users values ('${U(1)}'),('${U(2)}'),('${U(3)}'),('${U(4)}'),('${U(5)}');
  insert into app_user (id, auth_user_id, full_name, role, created_by) values ('${U(1)}','${U(1)}','ผู้ดูแล','admin','${U(1)}');
  insert into app_user (id, auth_user_id, full_name, role, created_by) values
    ('${U(2)}','${U(2)}','เจ้าของร้าน A','store_owner','${U(1)}'),
    ('${U(3)}','${U(3)}','เจ้าของร้าน B','store_owner','${U(1)}'),
    ('${U(4)}','${U(4)}','ส่งเสริม 1','promoter','${U(1)}'),
    ('${U(5)}','${U(5)}','ผู้จัดการ 1','promoter_manager','${U(1)}');
  insert into province (id, code, name_th, created_by) values ('${U(1)}','PV-X','จังหวัดตัวอย่าง','${U(1)}');
  insert into team (id, province_id, code, name, created_by) values ('${U(1)}','${U(1)}','T-1','ทีมตัวอย่าง 1','${U(1)}');
  insert into store (id, team_id, province_id, code, name, owner_user_id, owner_name, created_by) values
    ('a0000000-0000-0000-0000-00000000000a','${U(1)}','${U(1)}','S-A','ร้านตัวอย่าง A','${U(2)}','เจ้าของ A','${U(1)}'),
    ('b0000000-0000-0000-0000-00000000000b','${U(1)}','${U(1)}','S-B','ร้านตัวอย่าง B','${U(3)}','เจ้าของ B','${U(1)}');
  insert into store_assignment (store_id, promoter_user_id, manager_user_id, effective_from, created_by) values
    ('a0000000-0000-0000-0000-00000000000a','${U(4)}','${U(5)}', current_date - 30, '${U(1)}');
  insert into product (id, name_th, created_by) values ('${U(1)}','น้ำดื่มตัวอย่าง','${U(1)}');
  insert into sku (id, product_id, sku_code, size_desc, base_uom, pack_uom, units_per_pack, created_by)
    values ('${U(1)}','${U(1)}','SKU-1','600 มล.','ขวด','แพ็ก',12,'${U(1)}');
  insert into barcode (sku_id, barcode, level, units_per_level, created_by) values ('${U(1)}','8850000000001','unit',1,'${U(1)}');
  insert into wholesale_price (sku_id, price_per_unit, effective_from, created_by) values ('${U(1)}', 5.5, current_date - 30, '${U(1)}');
  insert into reference_price (sku_id, kind, price_per_unit, observed_date, created_by) values ('${U(1)}','recommended',7,current_date,'${U(1)}');
  insert into store_price (store_id, sku_id, retail_price_per_unit, set_by_owner, effective_from, created_by) values
    ('a0000000-0000-0000-0000-00000000000a','${U(1)}',7,true,current_date - 30,'${U(2)}');
  insert into stock_movement (store_id, sku_id, movement_type, qty_units, unit_cost, unit_wholesale, source_table, source_id, occurred_at, created_by)
    values ('a0000000-0000-0000-0000-00000000000a','${U(1)}','receipt',24,4.8,5.5,'seed',gen_random_uuid(),now() - interval '1 day','${U(1)}');
`);
console.log("✓ seed");

const A = "a0000000-0000-0000-0000-00000000000a";
const B = "b0000000-0000-0000-0000-00000000000b";
let pass = 0, fail = 0;

async function as(userN, sql) {
  await db.exec("reset role");
  if (userN === "anon") await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false);`);
  else if (userN) await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U(userN)}',false);`);
  try { return await db.query(sql); } finally { await db.exec("reset role"); }
}
function check(name, ok) {
  if (ok) { console.log("PASS", name); pass++; } else { console.log("FAIL", name); fail++; }
}
async function expectOk(name, fn) {
  try { const r = await fn(); console.log("PASS", name); pass++; return r; }
  catch (e) { console.log("FAIL", name, "→", e.message); fail++; }
}
async function expectErr(name, fn) {
  try { await fn(); console.log("FAIL", name, "→ ไม่ถูกปฏิเสธ"); fail++; }
  catch (e) { console.log("PASS", name, "→", e.message.slice(0, 90)); pass++; }
}
const sale = (store, ext) => `insert into pos_sale (store_id, external_txn_id, payment_method, total_amount, cash_received, change_amount)
  values ('${store}','${ext}','cash',14,20,6) returning id`;

// 1. เจ้าของร้าน A ขายร้านตนเอง
const r1 = await expectOk("เจ้าของ A สร้างบิลร้าน A", () => as(2, sale(A, "dev-1")));
const saleId = r1?.rows[0].id;
await expectOk("เจ้าของ A เพิ่มบรรทัดบิล (ราคาเติมโดย trigger)", () =>
  as(2, `insert into pos_sale_line (pos_sale_id, store_id, sku_id, qty_units, retail_price_per_unit, store_price_id, wholesale_per_unit, cost_per_unit)
         values ('${saleId}', '${A}', '${U(1)}', 2, 0, '${U(9)}', 0, 0)`));
const line = (await db.query(`select retail_price_per_unit, recommended_price_per_unit, wholesale_per_unit, line_total, is_test from pos_sale_line`)).rows[0];
console.log("   บรรทัด:", line);
check("บรรทัดบิลเก็บ snapshot ราคา + is_test", (line?.retail_price_per_unit == 7 && line?.line_total == 14 && line?.is_test));
const soh = (await db.query(`select qty_on_hand from v_stock_on_hand where store_id='${A}'`)).rows[0];
console.log("   สต๊อกคงเหลือ A:", soh);
check("ขาย 2 ชิ้น สต๊อกลดจาก 24 เป็น 22", soh?.qty_on_hand === 22);

// 2–3. ห้ามข้ามร้าน / ฝ่ายส่งเสริมห้ามสร้างบิล
await expectErr("เจ้าของ A สร้างบิลร้าน B", () => as(2, sale(B, "dev-2")));
await expectErr("ฝ่ายส่งเสริมสร้างบิล", () => as(4, sale(A, "dev-3")));
await expectErr("external_txn_id ซ้ำ", () => as(2, sale(A, "dev-1")));

// 4–5. Append-only แม้ superuser
await expectErr("แก้บิล (superuser)", () => db.query(`update pos_sale set total_amount = 0`));
await expectErr("ลบสต๊อก (superuser)", () => db.query(`delete from stock_movement`));
await expectErr("ลบ audit_log (superuser)", () => db.query(`delete from audit_log`));

// 6–7. ราคาแบบ Version
await expectOk("เจ้าของ A ตั้งราคาใหม่ 8 บาท", () =>
  as(2, `insert into store_price (store_id, sku_id, retail_price_per_unit, set_by_owner, effective_from) values ('${A}','${U(1)}',8,true,current_date)`));
const cur = (await db.query(`select retail_price_per_unit from v_store_price_current where store_id='${A}'`)).rows;
console.log("   ราคาปัจจุบัน:", cur);
check("ราคาปัจจุบันเป็น 8 บาท", cur.length === 1 && cur[0].retail_price_per_unit == 8);
const closed = (await db.query(`select count(*)::int n from store_price where effective_to is not null`)).rows[0].n;
check("ราคาเดิมถูกปิด effective_to", closed === 1);
await expectErr("แก้ราคาทับ (superuser)", () => db.query(`update store_price set retail_price_per_unit = 1`));
await expectErr("ส่งเสริมตั้งราคาแบบ set_by_owner", () =>
  as(4, `insert into store_price (store_id, sku_id, retail_price_per_unit, set_by_owner, effective_from) values ('${A}','${U(1)}',9,true,current_date)`));
await expectOk("ส่งเสริมกรอกราคาแทน (รอยืนยัน)", () =>
  as(4, `insert into store_price (store_id, sku_id, retail_price_per_unit, set_by_owner, effective_from) values ('${A}','${U(1)}',9,false,current_date)`));
const cur2 = (await db.query(`select retail_price_per_unit from v_store_price_current where store_id='${A}'`)).rows[0];
check("ราคารอยืนยันยังไม่มีผล", cur2?.retail_price_per_unit == 8);

// 8–9. การมองเห็น
const seeB = await as(3, `select count(*)::int n from pos_sale`);
check("เจ้าของ B ไม่เห็นบิลร้าน A", seeB.rows[0].n === 0);
const seeP = await as(4, `select count(*)::int n from pos_sale`);
check("ส่งเสริมเห็นบิลร้านที่ดูแล", seeP.rows[0].n === 1);
await expectErr("anon อ่าน pos_sale", () => as("anon", `select * from pos_sale`));
const auditOwner = await as(2, `select count(*)::int n from audit_log`);
check("เจ้าของร้านอ่าน audit_log ไม่ได้", auditOwner.rows[0].n === 0);

// 10–11. is_test + audit
const nt = (await db.query(`select (select count(*) from pos_sale where not is_test) + (select count(*) from stock_movement where not is_test) + (select count(*) from store where not is_test) as n`)).rows[0].n;
check("is_test = true ทุกแถว", Number(nt) === 0);
const au = (await db.query(`select table_name, action, count(*)::int n from audit_log group by 1,2 order by 1,2`)).rows;
console.log("   audit_log:", au.map((r) => `${r.table_name}:${r.action}=${r.n}`).join(" "));
check("audit_log บันทึกการปิดราคา", au.some((r) => r.table_name === "store_price" && r.action === "update"));

console.log(`\nผล: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
