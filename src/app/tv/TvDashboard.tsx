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
const POLL_OFFLINE_MS = 30_000;
const POLL_LIVE_MS = 120_000;

export function TvDashboard({ initial }: { initial: TvSummary | null }) {
  const [data, setData] = useState<TvSummary | null>(initial);
  const [conn, setConn] = useState<Conn>("connecting");
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
      <main className="flex flex-1 items-center justify-center bg-tv-bg text-2xl text-zinc-400">
        โหลดข้อมูลไม่ได้ — ตรวจการเชื่อมต่อเน็ต
      </main>
    );
  }

  return (
    <main className="grid flex-1 grid-cols-[1fr_28rem] gap-6 bg-tv-bg p-8 text-white">
      <section className="flex min-h-0 flex-col gap-6">
        <header className="flex items-end justify-between">
          <div className="flex items-center gap-5">
            <BrandLogo variant="onDark" className="h-16" />
            <div>
              <h1 className="text-4xl font-bold">ภาพรวมวันนี้</h1>
              <p className="text-xl text-zinc-400">{dateTh.format(new Date(data.as_of))} · ร้านตัวอย่างทั้งหมด {data.stores.length} ร้าน</p>
            </div>
          </div>
          <ConnBadge conn={conn} asOf={data.as_of} />
        </header>

        <div className="grid grid-cols-2 gap-6">
          <BigStat label="ยอดขายปลีกวันนี้ (บาท)" value={baht.format(data.today.retail_total)} pulse={flash.bills.size > 0} />
          <BigStat label="จำนวนบิลวันนี้" value={baht.format(data.today.bill_count)} pulse={flash.bills.size > 0} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <TypeBox title="ส่งเข้าร้าน" note="มูลค่าตามราคาส่ง" today={data.today.delivered_wholesale} week={data.week.delivered_wholesale} />
          <TypeBox title="ขายปลีกจริง" note="ตามราคาที่ร้านตั้งเอง" today={data.today.retail_total} week={data.week.retail_total} />
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-brand-line/40 p-5">
            <p className="text-xl font-semibold text-zinc-300">เงินรับจริง</p>
            <p className="text-sm text-zinc-500">ร้านนำส่งเงินให้ P1</p>
            <p className="mt-auto text-lg text-zinc-400">รอโมดูลรับเงินนำส่ง</p>
            <span className="w-fit rounded bg-tv-flash px-2 py-0.5 text-sm font-semibold text-accent-light">เฟสถัดไป</span>
          </div>
        </div>

        <StoreMap stores={data.stores} flashing={flash.stores} />
      </section>

      <aside className="flex min-h-0 flex-col gap-3">
        <h2 className="text-2xl font-semibold">บิลล่าสุด</h2>
        <ul className="flex flex-col gap-2 overflow-hidden">
          {data.feed.map((f) => (
            <li
              key={f.id}
              className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors duration-1000 ${
                flash.bills.has(f.id) ? "bg-tv-flash" : "bg-tv-panel"
              }`}
            >
              <div>
                <p className="text-lg font-semibold">{f.store_name}</p>
                <p className="text-sm text-zinc-400">
                  {time.format(new Date(f.sold_at))} · {f.units} ชิ้น · {f.payment_method === "cash" ? "เงินสด" : "PromptPay (ตัวอย่าง)"}
                </p>
              </div>
              <p className="text-2xl font-bold tabular-nums">฿{baht.format(f.total_amount)}</p>
            </li>
          ))}
          {data.feed.length === 0 && <li className="text-zinc-500">ยังไม่มีบิล</li>}
        </ul>
      </aside>
    </main>
  );
}

function ConnBadge({ conn, asOf }: { conn: Conn; asOf: string }) {
  const style = { live: "bg-emerald-500", connecting: "bg-amber-400", offline: "bg-red-500" }[conn];
  const label = { live: "Realtime", connecting: "กำลังเชื่อมต่อ…", offline: "หลุดการเชื่อมต่อ · ดึงข้อมูลทุก 30 วินาที" }[conn];
  return (
    <div className="flex flex-col items-end gap-1 text-zinc-300">
      <span className="flex items-center gap-2 text-lg">
        <span className={`h-3 w-3 rounded-full ${style} ${conn === "live" ? "animate-pulse" : ""}`} />
        {label}
      </span>
      <span className="text-sm text-zinc-500">อัปเดต {time.format(new Date(asOf))}</span>
    </div>
  );
}

function BigStat({ label, value, pulse }: { label: string; value: string; pulse: boolean }) {
  return (
    <div className={`rounded-2xl p-6 transition-colors duration-1000 ${pulse ? "bg-tv-flash" : "bg-tv-panel"}`}>
      <p className="text-xl text-zinc-400">{label}</p>
      <p className="text-7xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function TypeBox({ title, note, today, week }: { title: string; note: string; today: number; week: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-tv-panel p-5">
      <p className="text-xl font-semibold">{title}</p>
      <p className="text-sm text-zinc-500">{note}</p>
      <p className="mt-auto text-3xl font-bold tabular-nums">฿{baht.format(today)}</p>
      <p className="text-sm text-zinc-400">วันนี้ · 7 วันล่าสุด ฿{baht.format(week)}</p>
    </div>
  );
}

function StoreMap({ stores, flashing }: { stores: TvStore[]; flashing: Set<string> }) {
  const max = Math.max(1, ...stores.map((s) => s.retail_today));
  return (
    <div className="relative min-h-64 flex-1 rounded-2xl bg-tv-panel">
      <span className="absolute left-4 top-3 text-sm text-zinc-500">ผังจำลอง — ไม่ใช่ตำแหน่งจริง</span>
      {stores.map((s, i) => {
        const [x, y] = SPOTS[i % SPOTS.length];
        const size = 28 + Math.round((s.retail_today / max) * 36);
        const hot = flashing.has(s.id);
        return (
          <div key={s.id} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
              {hot && <span className="absolute inset-0 animate-ping rounded-full bg-accent-light" />}
              <span className={`relative h-full w-full rounded-full ${hot ? "bg-accent-light" : "bg-accent"}`} />
            </span>
            <span className="whitespace-nowrap text-lg font-semibold">{s.name}</span>
            <span className="whitespace-nowrap text-sm text-zinc-400 tabular-nums">
              ฿{baht.format(s.retail_today)} · {s.bills_today} บิล
            </span>
          </div>
        );
      })}
    </div>
  );
}
