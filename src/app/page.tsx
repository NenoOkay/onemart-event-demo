import Link from "next/link";

const entries = [
  { href: "/pos", label: "POS ร้าน (Sunmi)", note: "P1–P6 · เฟสถัดไป" },
  { href: "/tv", label: "ทีวี ภาพรวม", note: "B1 · Realtime" },
  { href: "/admin", label: "หลังบ้าน", note: "B2–B5" },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">ONE MART — เดโม</h1>
      {entries.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          className="flex min-h-12 flex-col justify-center rounded-lg border border-zinc-300 px-4 py-3 hover:bg-zinc-50"
        >
          <span className="text-lg font-semibold">{e.label}</span>
          <span className="text-sm text-zinc-500">{e.note}</span>
        </Link>
      ))}
    </main>
  );
}
