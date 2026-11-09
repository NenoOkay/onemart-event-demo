// โลโก้ ONE MART (EV-12) — ไฟล์อยู่ใน public/brand · สีเต็มสำหรับพื้นสว่าง
// พื้นมืด (ทีวี) ใช้ variant="onDark" = วางบนกล่องขาวโค้งมน เพราะตัวอักษรโลโก้เป็นม่วงเข้ม
export function BrandLogo({ className = "h-10", variant = "color" }: { className?: string; variant?: "color" | "onDark" }) {
  // SVG ไม่ผ่านการย่อของ next/image อยู่แล้ว ใช้ <img> ตรง ๆ
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src="/brand/logo-color.svg" alt="ONE MART วันมาร์ท" className={`${className} w-auto`} />;
  if (variant === "onDark") return <span className="inline-flex w-fit rounded-xl bg-white px-3 py-1">{img}</span>;
  return img;
}
