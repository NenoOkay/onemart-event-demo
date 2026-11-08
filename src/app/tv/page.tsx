import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TvDashboard, type TvSummary } from "./TvDashboard";

// B1 ภาพรวมบนทีวี — โหลดก้อนแรกฝั่งเซิร์ฟเวอร์ แล้วให้ Client ฟัง Realtime ต่อ
export default function TvPage() {
  return (
    <Suspense fallback={<main className="flex-1 bg-zinc-950 p-8 text-2xl text-zinc-400">กำลังโหลด…</main>}>
      <TvLoader />
    </Suspense>
  );
}

async function TvLoader() {
  await connection(); // ยอดสดต่อผู้ใช้ — render ตอนมี request เท่านั้น
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/tv/login");

  const { data } = await supabase.rpc("tv_summary");
  return <TvDashboard initial={(data as TvSummary | null) ?? null} />;
}
