"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBaht, toSatang, type CartLine } from "@/lib/pos/cart";
import { demoQrSvg } from "@/lib/pos/demoQr";

type Method = "cash" | "promptpay_demo";

const NOTES = [20, 50, 100, 500, 1000];

// เลขที่บิลจากเครื่อง: รหัสร้าน-ปีเดือนวัน-เวลา-สุ่ม 2 ตัว (เวลาไทย) · ใช้กันบันทึกซ้ำเมื่อกดส่งใหม่
function newBillNo(storeCode: string): string {
  const d = new Date(Date.now() + 7 * 3600_000).toISOString(); // 2026-10-30T14:23:05.000Z
  const ymd = d.slice(2, 10).replaceAll("-", ""), hms = d.slice(11, 19).replaceAll(":", "");
  const rnd = Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase().padStart(2, "0");
  return `${storeCode}-${ymd}-${hms}-${rnd}`;
}

// บิลที่กำลังรับเงินเก็บไว้ในเครื่อง: ถ้าแอปปิดกลางทางแล้วกลับมาด้วยตะกร้าเดิม ใช้เลขบิลเดิม (ไม่บันทึกซ้ำ)
function pendingBillNo(storeId: string, storeCode: string, lines: CartLine[]): string {
  const key = `onemart.pending.${storeId}`, cart = JSON.stringify(lines);
  if (!lines.length) return ""; // ตะกร้าถูกล้างหลังบันทึกสำเร็จ
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (saved?.cart === cart && typeof saved.billNo === "string") return saved.billNo;
    const billNo = newBillNo(storeCode);
    localStorage.setItem(key, JSON.stringify({ billNo, cart }));
    return billNo;
  } catch {
    return newBillNo(storeCode);
  }
}

export function PayPanel({
  store, lines, totalSatang, onBack, onPaid,
}: {
  store: { id: string; code: string };
  lines: CartLine[];
  totalSatang: number;
  onBack: () => void;
  onPaid: () => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("cash");
  const [received, setReceived] = useState(0); // สตางค์
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const billNo = useMemo(() => pendingBillNo(store.id, store.code, lines), [store.id, store.code, lines]);
  const qrSvg = useMemo(() => demoQrSvg(), []);

  const change = received - totalSatang;
  const canPay = method === "promptpay_demo" || received >= totalSatang;

  async function pay() {
    setSaving(true);
    setError(null);
    const { data, error } = await createClient().rpc("create_pos_sale", {
      p_store_id: store.id,
      p_external_txn_id: billNo,
      p_payment_method: method,
      p_cash_received: method === "cash" ? received / 100 : null,
      p_lines: lines.map((l) => ({ sku_id: l.skuId, qty: l.qty })),
    });
    const sale = Array.isArray(data) ? data[0] : null;
    if (error || !sale) {
      setSaving(false);
      setError(error?.message.includes("Failed to fetch")
        ? "บันทึกไม่สำเร็จ — ตรวจเน็ตแล้วกดอีกครั้ง (ไม่บันทึกซ้ำ)"
        : `บันทึกไม่สำเร็จ: ${error?.message ?? "ไม่ทราบสาเหตุ"}`);
      return;
    }
    try { localStorage.removeItem(`onemart.pending.${store.id}`); } catch { /* ไม่มีที่เก็บก็ไม่เป็นไร */ }
    onPaid();
    router.push(`/pos/receipt/${sale.sale_id}?new=1`);
  }

  return (
    <section className="flex flex-1 flex-col gap-3 px-3 pb-6 pt-3" aria-label="รับเงิน">
      <div className="flex items-center justify-between">
        <button onClick={onBack} disabled={saving} className="min-h-12 px-2 text-sky-700">← แก้ตะกร้า</button>
        <span className="text-xs text-zinc-500">{billNo}</span>
      </div>

      <div className="text-center">
        <div className="text-sm text-zinc-500">ยอดที่ต้องชำระ (บาท)</div>
        <div className="text-5xl font-bold tabular-nums">{formatBaht(totalSatang)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist">
        {([["cash", "เงินสด"], ["promptpay_demo", "PromptPay (ตัวอย่าง)"]] as const).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={method === m}
            onClick={() => setMethod(m)}
            className={`min-h-12 rounded-lg font-semibold ${method === m ? "bg-zinc-900 text-white" : "bg-zinc-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {method === "cash" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {NOTES.map((n) => (
              <button key={n} onClick={() => setReceived((r) => r + toSatang(n))}
                className="min-h-14 rounded-lg bg-emerald-50 text-xl font-semibold ring-1 ring-emerald-200 active:bg-emerald-200">
                +{n}
              </button>
            ))}
            <button onClick={() => setReceived(totalSatang)}
              className="min-h-14 rounded-lg bg-zinc-100 text-lg font-semibold active:bg-zinc-300">พอดี</button>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
            <span className="text-zinc-600">รับเงิน</span>
            <span className="text-3xl font-semibold tabular-nums">{formatBaht(received)}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
            <span className="text-zinc-600">เงินทอน</span>
            <span className={`text-3xl font-bold tabular-nums ${change < 0 ? "text-zinc-400" : "text-emerald-700"}`}>
              {change < 0 ? `ขาดอีก ${formatBaht(-change)}` : formatBaht(change)}
            </span>
          </div>
          {received > 0 && (
            <button onClick={() => setReceived(0)} className="min-h-12 self-start px-2 text-sm text-red-700">ล้างจำนวนรับเงิน</button>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="opacity-60" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-12deg] rounded bg-red-600 px-3 py-1 text-lg font-bold text-white shadow">
                ตัวอย่าง · สแกนจ่ายไม่ได้
              </span>
            </div>
          </div>
          <p className="text-center text-sm text-zinc-500">ภาพตัวอย่างเพื่อการสาธิต — ไม่มีการรับเงินจริง</p>
        </div>
      )}

      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</p>}

      <button
        onClick={pay}
        disabled={!canPay || saving}
        className="mt-auto min-h-16 rounded-xl bg-emerald-600 text-2xl font-bold text-white disabled:opacity-40"
      >
        {saving ? "กำลังบันทึก…" : method === "cash" ? "รับเงินแล้ว · ออกใบเสร็จ" : "ได้รับเงินแล้ว"}
      </button>
    </section>
  );
}
