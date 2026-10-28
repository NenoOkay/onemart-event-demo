// P1–P6 จะสร้างในวันที่ 3–8 · ตอนนี้เป็นโครงหน้า
export default function PosPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-4">
      <span className="self-start rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
        เฟสถัดไป
      </span>
      <h1 className="text-xl font-bold">POS ร้าน</h1>
      <p className="text-zinc-500">หน้าขาย — อยู่ระหว่างพัฒนา</p>
    </main>
  );
}
