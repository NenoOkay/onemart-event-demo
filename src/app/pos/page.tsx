import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPosContext } from "@/lib/pos/catalog";
import { SaleScreen } from "./SaleScreen";

// P2 ขาย
export default function PosPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">กำลังโหลดสินค้า…</p>}>
      <PosLoader />
    </Suspense>
  );
}

async function PosLoader() {
  await connection(); // ข้อมูลร้านต่อผู้ใช้ — render ตอนมี request เท่านั้น
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/pos/login");

  const ctx = await loadPosContext(supabase, data.claims.sub);
  if (!ctx) redirect("/pos/login");
  return <SaleScreen ctx={ctx} />;
}
