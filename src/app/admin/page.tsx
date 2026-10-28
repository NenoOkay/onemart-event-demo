// B2–B5 จะสร้างในวันที่ 7–8
const screens = [
  { code: "B2", label: "สต๊อกฝากขาย" },
  { code: "B3", label: "รอบส่งของ" },
  { code: "B4", label: "รอบปิดยอดและนำส่งเงิน" },
  { code: "B5", label: "ผลประโยชน์ฝ่ายส่งเสริม" },
];

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">หลังบ้าน</h1>
      <ul className="grid grid-cols-2 gap-3">
        {screens.map((s) => (
          <li key={s.code} className="rounded-lg border border-zinc-300 p-4">
            <span className="text-sm text-zinc-500">{s.code}</span>
            <div className="font-semibold">{s.label}</div>
            <div className="text-sm text-zinc-400">อยู่ระหว่างพัฒนา</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
