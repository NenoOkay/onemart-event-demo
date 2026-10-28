// แถบถาวรทุกหน้าจอ (Spec ข้อ 2 · EV-06) — ห้ามมีปุ่มปิด
export function DemoBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 w-full bg-amber-400 px-3 py-1 text-center text-sm font-semibold text-black"
    >
      ข้อมูลจำลองเพื่อการสาธิต
    </div>
  );
}
