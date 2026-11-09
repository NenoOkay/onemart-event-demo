"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";

type Totals = { retail_total: number; bill_count: number; delivered_wholesale: number };
type TvStore = { id: string; code: string; name: string; retail_today: number; bills_today: number; last_sold_at: string | null };
type FeedItem = { id: string; store_id: string; sold_at: string; total_amount: number; payment_method: string; store_name: string; units: number };
export type TvSummary = { as_of: string; today: Totals; week: Totals; stores: TvStore[]; feed: FeedItem[] };

type Conn = "live" | "connecting" | "offline";

const baht = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" });
const dateTh = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" });

// ผังจำลอง (ไม่ใช่พิกัดจริง · ห้ามอ้างจังหวัด) — ตำแหน่งเป็น % ของกรอบ เรียงตามรหัสร้าน
const SPOTS = [
  [18, 30], [48, 18], [80, 32], [30, 72], [68, 74],
  [50, 48], [10, 58], [88, 62], [40, 90], [62, 8],
];
const FLASH_MS = 4000;
const STORE_COLORS = 5; // --color-store-1..5 ใน globals.css
const POLL_OFFLINE_MS = 30_000;
const POLL_LIVE_MS = 120_000;

export function TvDashboard({ initial }: { initial: TvSummary | null }) {
  const [data, setData] = useState<TvSummary | null>(initial);
  const [conn, setConn] = useState<Conn>("connecting");
  const [page, setPage] = useState<"chart" | "map">("chart"); // หน้า 2 = ผังร้าน · มีบิลใหม่เด้งกลับหน้า 1
  const [flash, setFlash] = useState<{ bills: Set<string>; stores: Set<string> }>({ bills: new Set(), stores: new Set() });
  const seen = useRef<Set<string>>(new Set(initial?.feed.map((f) => f.id)));
  const [supabase] = useState(createClient);

  const refresh = useCallback(async () => {
    const { data: next, error } = await supabase.rpc("tv_summary");
    if (error || !next) return;
    const summary = next as TvSummary;
    const fresh = summary.feed.filter((f) => !seen.current.has(f.id));
    summary.feed.forEach((f) => seen.current.add(f.id));
    setData(summary);
    if (fresh.length) {
      const bills = new Set(fresh.map((f) => f.id));
      const stores = new Set(fresh.map((f) => f.store_id));
      setFlash({ bills, stores });
      setPage("chart");
      setTimeout(() => setFlash({ bills: new Set(), stores: new Set() }), FLASH_MS);
    }
  }, [supabase]);

  // Realtime: บิลใหม่ (รวมบิลกลับรายการ) → ดึงสรุปใหม่ทั้งก้อน · หน่วงสั้น ๆ รวมหลายบิลที่มาพร้อมกัน
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("tv-pos-sale")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pos_sale" }, () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 300);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConn("live");
          refresh(); // เก็บบิลที่อาจหลุดระหว่างหลุดการเชื่อมต่อ
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConn("offline");
        }
      });
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  // สำรอง: ถ้า Realtime หลุด ดึงเองทุก 30 วินาที · ปกติดึงทุก 2 นาทีกันตัวเลขค้าง
  useEffect(() => {
    const id = setInterval(refresh, conn === "live" ? POLL_LIVE_MS : POLL_OFFLINE_MS);
    return () => clearInterval(id);
  }, [conn, refresh]);

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center bg-tv-bg text-2xl text-tv-muted">
        โหลดข้อมูลไม่ได้ — ตรวจการเชื่อมต่อเน็ต
      </main>
    );
  }

  const storeColor = new Map(data.stores.map((s, i) => [s.id, i % STORE_COLORS] as const));
  const pulse = flash.bills.size > 0;

  return (
    <main className="grid flex-1 grid-cols-[1fr_28rem] bg-tv-bg text-zinc-900">
      <section className="flex min-h-0 flex-col gap-6 p-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <BrandLogo className="h-20" />
            <div>
              <h1 className="text-4xl font-bold text-brand-dark">ภาพรวมวันนี้</h1>
              <p className="text-xl text-tv-muted">{dateTh.format(new Date(data.as_of))} · ร้านตัวอย่างทั้งหมด {data.stores.length} ร้าน</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Clock />
            <ConnBadge conn={conn} asOf={data.as_of} />
          </div>
        </header>

        <div className="grid grid-cols-2 gap-6">
          <BigStat label="ยอดขายปลีกวันนี้ (บาท)" value={baht.format(data.today.retail_total)} pulse={pulse} tone="bg-brand" sub="text-brand-soft" />
          <BigStat label="จำนวนบิลวันนี้" value={baht.format(data.today.bill_count)} pulse={pulse} tone="bg-accent" sub="text-accent-soft" />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <TypeBox title="ส่งเข้าร้าน" note="มูลค่าตามราคาส่ง" today={data.today.delivered_wholesale} week={data.week.delivered_wholesale} tone="bg-tv-teal-bg text-tv-teal" />
          <TypeBox title="ขายปลีกจริง" note="ตามราคาที่ร้านตั้งเอง" today={data.today.retail_total} week={data.week.retail_total} tone="bg-tv-pink-bg text-tv-pink" />
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-brand-line p-5 text-brand-dark">
            <p className="text-xl font-semibold">เงินรับจริง</p>
            <p className="text-sm text-tv-muted">ร้านนำส่งเงินให้ P1</p>
            <p className="mt-auto text-lg">รอโมดูลรับเงินนำส่ง</p>
            <span className="w-fit rounded bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand">เฟสถัดไป</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl bg-tv-panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-brand-dark">{page === "chart" ? "ยอดขายปลีกวันนี้ แยกร้าน (บาท)" : "ผังร้าน"}</h2>
            <div className="flex gap-2" role="tablist">
              {(["chart", "map"] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={page === p}
                  onClick={() => setPage(p)}
                  className={`rounded-full px-4 py-1 text-lg font-semibold ${page === p ? "bg-brand text-white" : "bg-white text-brand ring-1 ring-brand-line"}`}
                >
                  {p === "chart" ? "1 · ภาพรวม" : "2 · ผังร้าน"}
                </button>
              ))}
            </div>
          </div>
          {page === "chart"
            ? <StoreBars stores={data.stores} flashing={flash.stores} />
            : <StoreMap stores={data.stores} flashing={flash.stores} />}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-3 bg-tv-feed p-6 text-white">
        <h2 className="text-2xl font-semibold">บิลล่าสุด</h2>
        <ul className="flex flex-col gap-2 overflow-hidden">
          {data.feed.map((f) => {
            const c = (storeColor.get(f.store_id) ?? 0) + 1;
            return (
              <li
                key={f.id}
                className={`flex items-center justify-between border-l-8 px-4 py-3 transition-colors duration-1000 ${
                  flash.bills.has(f.id) ? "bg-tv-feed-flash" : "bg-tv-feed-item"
                }`}
                style={{ borderColor: `var(--color-store-${c})` }}
              >
                <div>
                  <p className="text-lg font-semibold" style={{ color: `var(--color-store-${c}-light)` }}>{f.store_name}</p>
                  <p className="text-sm text-zinc-300">
                    {time.format(new Date(f.sold_at))} · {f.units} ชิ้น · {f.payment_method === "cash" ? "เงินสด" : "PromptPay (ตัวอย่าง)"}
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums">฿{baht.format(f.total_amount)}</p>
              </li>
            );
          })}
          {data.feed.length === 0 && <li className="text-zinc-400">ยังไม่มีบิล</li>}
        </ul>
      </aside>
    </main>
  );
}

// นาฬิกาเดินทุกวินาที ให้เห็นว่าจอ Active · เริ่มแสดงหลัง mount (กัน hydration ไม่ตรงกับเซิร์ฟเวอร์)
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return <span className="min-h-12 text-5xl font-bold tabular-nums text-brand">{now ? time.format(now) : ""}</span>;
}

function ConnBadge({ conn, asOf }: { conn: Conn; asOf: string }) {
  const style = { live: "bg-emerald-500", connecting: "bg-amber-400", offline: "bg-red-500" }[conn];
  const label = { live: "Realtime", connecting: "กำลังเชื่อมต่อ…", offline: "หลุดการเชื่อมต่อ · ดึงข้อมูลทุก 30 วินาที" }[conn];
  return (
    <span className="flex items-center gap-2 text-lg text-tv-muted">
      <span className={`h-3 w-3 rounded-full ${style} ${conn === "live" ? "animate-pulse" : ""}`} />
      {label} · อัปเดต {time.format(new Date(asOf))}
    </span>
  );
}

function BigStat({ label, value, pulse, tone, sub }: { label: string; value: string; pulse: boolean; tone: string; sub: string }) {
  return (
    <div className={`rounded-2xl p-6 text-white transition-transform duration-500 ${tone} ${pulse ? "scale-[1.03] ring-8 ring-accent-light" : ""}`}>
      <p className={`text-xl ${sub}`}>{label}</p>
      <p className="text-7xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function TypeBox({ title, note, today, week, tone }: { title: string; note: string; today: number; week: number; tone: string }) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl p-5 ${tone}`}>
      <p className="text-xl font-semibold">{title}</p>
      <p className="text-sm opacity-80">{note}</p>
      <p className="mt-auto text-3xl font-bold tabular-nums">฿{baht.format(today)}</p>
      <p className="text-sm opacity-80">วันนี้ · 7 วันล่าสุด ฿{baht.format(week)}</p>
    </div>
  );
}

// กราฟแท่งแนวนอน วาดด้วย CSS (5 ร้าน ไม่ต้องใช้ library) · เรียงตามรหัสร้านให้ตำแหน่ง/สีคงที่
function StoreBars({ stores, flashing }: { stores: TvStore[]; flashing: Set<string> }) {
  const max = Math.max(1, ...stores.map((s) => s.retail_today));
  return (
    <ul className="flex flex-1 flex-col justify-around gap-2">
      {stores.map((s, i) => {
        const c = (i % STORE_COLORS) + 1;
        const hot = flashing.has(s.id);
        return (
          <li key={s.id} className="grid grid-cols-[13rem_1fr_9rem] items-center gap-4">
            <span className="truncate text-xl font-semibold" style={{ color: `var(--color-store-${c})` }}>{s.name}</span>
            <span className="h-10 overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200">
              <span
                className={`block h-full rounded-lg transition-[width] duration-700 ease-out ${hot ? "animate-pulse" : ""}`}
                style={{ width: `${(s.retail_today / max) * 100}%`, background: `var(--color-store-${c})` }}
              />
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-2xl font-bold">฿{baht.format(s.retail_today)}</span>
              <span className="text-sm text-tv-muted">{s.bills_today} บิล</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StoreMap({ stores, flashing }: { stores: TvStore[]; flashing: Set<string> }) {
  const max = Math.max(1, ...stores.map((s) => s.retail_today));
  return (
    <div className="relative min-h-64 flex-1">
      <span className="absolute left-0 top-0 text-sm text-tv-muted">ผังจำลอง — ไม่ใช่ตำแหน่งจริง</span>
      {stores.map((s, i) => {
        const [x, y] = SPOTS[i % SPOTS.length];
        const size = 28 + Math.round((s.retail_today / max) * 36);
        const hot = flashing.has(s.id);
        const color = `var(--color-store-${(i % STORE_COLORS) + 1})`;
        return (
          <div key={s.id} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
              {hot && <span className="absolute inset-0 animate-ping rounded-full" style={{ background: color }} />}
              <span className="relative h-full w-full rounded-full" style={{ background: color }} />
            </span>
            <span className="whitespace-nowrap text-lg font-semibold" style={{ color }}>{s.name}</span>
            <span className="whitespace-nowrap text-sm text-tv-muted tabular-nums">
              ฿{baht.format(s.retail_today)} · {s.bills_today} บิล
            </span>
          </div>
        );
      })}
    </div>
  );
}
