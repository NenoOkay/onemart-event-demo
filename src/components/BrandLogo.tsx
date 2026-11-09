// โลโก้ ONE MART (EV-12) — ไฟล์อยู่ใน public/brand · สีเต็ม ใช้บนพื้นสว่าง (POS + ทีวีธีมสว่าง EV-13)
export function BrandLogo({ className = "h-10" }: { className?: string }) {
  // SVG ไม่ผ่านการย่อของ next/image อยู่แล้ว ใช้ <img> ตรง ๆ
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/logo-color.svg" alt="ONE MART วันมาร์ท" className={`${className} w-auto`} />;
}
