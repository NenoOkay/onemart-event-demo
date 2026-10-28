// เดโมเท่านั้น: เจ้าของร้านเข้าระบบด้วย "เลือกร้าน + PIN 4 หลัก" (Spec P1)
// Supabase บังคับรหัสผ่าน ≥ 6 ตัว จึงแปลง PIN เป็นรหัสผ่านฝั่งเซิร์ฟเวอร์
// PIN 4 หลักเดาได้ง่าย — ห้ามใช้วิธีนี้กับ Pilot/ระบบจริง
// ไฟล์นี้ต้องไม่ import อะไร เพราะสคริปต์ seed (Node) ใช้ร่วมด้วย

export const DEMO_EMAIL_DOMAIN = "demo.onemart.invalid";

export function ownerEmail(storeCode: string): string {
  return `owner-${storeCode.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`;
}

export function staffEmail(key: string): string {
  return `${key}@${DEMO_EMAIL_DOMAIN}`;
}

export function pinToPassword(storeCode: string, pin: string): string {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN ต้องเป็นตัวเลข 4 หลัก");
  return `om-demo-${storeCode.toLowerCase()}-${pin}`;
}
