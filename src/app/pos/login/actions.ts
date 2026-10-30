"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ownerEmail, pinToPassword } from "@/lib/auth/demo-pin";

const LoginInput = z.object({
  storeCode: z.string().regex(/^[A-Z0-9-]{1,20}$/),
  pin: z.string().regex(/^\d{4}$/),
});

export type LoginResult = { error: string } | undefined;

// P1: เลือกร้าน + PIN → แปลงเป็นรหัสผ่านฝั่งเซิร์ฟเวอร์ (ไม่ส่งสูตรไปที่เครื่อง)
export async function loginWithPin(storeCode: string, pin: string): Promise<LoginResult> {
  const parsed = LoginInput.safeParse({ storeCode, pin });
  if (!parsed.success) return { error: "กรุณาเลือกร้านและใส่ PIN 4 หลัก" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: ownerEmail(parsed.data.storeCode),
    password: pinToPassword(parsed.data.storeCode, parsed.data.pin),
  });
  if (error || !data.user) return { error: "PIN ไม่ถูกต้อง" };

  // POS ใช้ได้เฉพาะบัญชีเจ้าของร้าน (Spec P1)
  const { data: me } = await supabase.from("app_user").select("role").eq("auth_user_id", data.user.id).single();
  if (me?.role !== "store_owner") {
    await supabase.auth.signOut();
    return { error: "บัญชีนี้ใช้ POS ไม่ได้" };
  }
  redirect("/pos");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/pos/login");
}
