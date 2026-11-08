"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { staffEmail } from "@/lib/auth/demo-pin";

export type TvLoginResult = { error: string } | undefined;

// B1: จอทีวีเข้าระบบด้วยบัญชีผู้บริหาร (รหัสผ่านอยู่ใน scripts/.demo-credentials.json)
export async function loginTv(password: string): Promise<TvLoginResult> {
  const parsed = z.string().min(6).max(100).safeParse(password);
  if (!parsed.success) return { error: "กรุณาใส่รหัสผ่าน" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: staffEmail("executive"),
    password: parsed.data,
  });
  if (error || !data.user) return { error: "รหัสผ่านไม่ถูกต้อง" };

  // ทีวีต้องเห็นทุกร้าน — ใช้ได้เฉพาะบัญชีผู้บริหาร
  const { data: me } = await supabase.from("app_user").select("role").eq("auth_user_id", data.user.id).single();
  if (me?.role !== "executive") {
    await supabase.auth.signOut();
    return { error: "บัญชีนี้ใช้จอทีวีไม่ได้" };
  }
  redirect("/tv");
}
