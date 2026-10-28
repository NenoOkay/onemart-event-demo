// ทดสอบ RLS บน Supabase Event Project จริง ด้วยบัญชีเดโมแต่ละบทบาท (หลัง npm run seed)
// รัน: npm run test:remote
// ทดสอบเฉพาะสิ่งที่ "ต้องถูกปฏิเสธ" และการอ่าน — ไม่สร้างข้อมูลจริงเพิ่มบนฐานข้อมูล
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
process.loadEnvFile(here("../../.env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const creds: { key: string; email: string; password: string }[] =
  JSON.parse(readFileSync(here("../../scripts/.demo-credentials.json"), "utf8"));

let pass = 0, fail = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(ok ? "PASS" : "FAIL", name, info);
  if (ok) pass++; else fail++;
}

async function as(userKey: string): Promise<SupabaseClient> {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const u = creds.find((x) => x.key === userKey)!;
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`login ${userKey}: ${error.message}`);
  return c;
}

const anon = createClient(url, key, { auth: { persistSession: false } });
const { error: anonErr } = await anon.from("pos_sale").select("id").limit(1);
check("anon อ่าน pos_sale ไม่ได้", !!anonErr, anonErr?.code);

const exec = await as("executive");
const { data: allStores } = await exec.from("store").select("id, code").order("code");
check("ผู้บริหารเห็นร้านครบ 5 ร้าน", allStores?.length === 5, `${allStores?.length}`);
const storeB = allStores!.find((s) => s.code === "S-B")!.id;
const storeA = allStores!.find((s) => s.code === "S-A")!.id;

const ownerA = await as("owner-S-A");
const { data: aSales } = await ownerA.from("pos_sale").select("store_id");
check("เจ้าของ A เห็นเฉพาะบิลร้าน A", !!aSales?.length && aSales.every((s) => s.store_id === storeA), `${aSales?.length} บิล`);
const { error: crossErr } = await ownerA.from("pos_sale").insert({
  store_id: storeB, external_txn_id: `rls-test-${Date.now()}`, payment_method: "cash", total_amount: 10, cash_received: 20,
});
check("เจ้าของ A สร้างบิลร้าน B ไม่ได้", !!crossErr, crossErr?.code);
const { data: aAudit } = await ownerA.from("audit_log").select("id").limit(1);
check("เจ้าของร้านอ่าน audit_log ไม่ได้", (aAudit ?? []).length === 0);
const { data: upd } = await ownerA.from("pos_sale").update({ total_amount: 0 }).eq("store_id", storeA).select("id");
check("เจ้าของ A แก้บิลไม่ได้ (0 แถว)", (upd ?? []).length === 0);

const promoter1 = await as("promoter-1");
const { data: pStores } = await promoter1.from("store").select("code").order("code");
check("ผู้ส่งเสริม 1 เห็นเฉพาะร้านที่ดูแล (A–C)", pStores?.map((s) => s.code).join() === "S-A,S-B,S-C", pStores?.map((s) => s.code).join());
const { error: pSaleErr } = await promoter1.from("pos_sale").insert({
  store_id: storeA, external_txn_id: `rls-test-p-${Date.now()}`, payment_method: "cash", total_amount: 10, cash_received: 20,
});
check("ผู้ส่งเสริมสร้างบิลไม่ได้", !!pSaleErr, pSaleErr?.code);
const { data: anySku } = await promoter1.from("sku").select("id").limit(1);
const { error: pPriceErr } = await promoter1.from("store_price").insert({
  store_id: storeA, sku_id: anySku![0].id, retail_price_per_unit: 99, set_by_owner: true, effective_from: new Date().toISOString().slice(0, 10),
});
check("ผู้ส่งเสริมตั้งราคาในนามเจ้าของร้านไม่ได้", !!pPriceErr, pPriceErr?.code);

const { data: nonTest } = await exec.from("pos_sale").select("id").eq("is_test", false).limit(1);
check("บิลทุกใบเป็น is_test", (nonTest ?? []).length === 0);

console.log(`\nผล: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
