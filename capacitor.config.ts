import type { CapacitorConfig } from "@capacitor/cli";

// แอป Android บน Sunmi ห่อหน้า /pos ที่ deploy บน Vercel (ต้องมีเน็ต — Realtime/บันทึกบิลใช้ Supabase อยู่แล้ว)
// ตั้ง URL ก่อน sync: CAP_SERVER_URL=https://<project>.vercel.app npx cap sync android
// ไม่ตั้ง = เปิดหน้า capacitor-www (หน้าแจ้งให้ตั้งค่า)
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.onemart.eventdemo",
  appName: "ONE MART เดโม",
  webDir: "capacitor-www",
  server: serverUrl
    ? { url: `${serverUrl.replace(/\/$/, "")}/pos`, cleartext: false }
    : undefined,
};

export default config;
