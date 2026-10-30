"use client";

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import {
  cartReducer, lookupBarcode, cartTotalSatang, cartItemCount, lineTotalSatang, formatBaht, searchCatalog,
  sanitizeStoredCart, type CatalogItem, type CartLine,
} from "@/lib/pos/cart";
import type { PosContext } from "@/lib/pos/catalog";
import { logout } from "./login/actions";
import { CameraScanner } from "./CameraScanner";
import { PayPanel } from "./PayPanel";

type Notice = { kind: "ok" | "warn"; text: string } | null;

const noopSubscribe = () => () => {};

// ตะกร้าอยู่ในเครื่อง (localStorage) จึง render หน้าขายฝั่งเครื่องเท่านั้น — ไม่ต้องรอโหลดใน effect
export function SaleScreen({ ctx }: { ctx: PosContext }) {
  const onClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!onClient) return <p className="p-4 text-zinc-500">กำลังโหลดหน้าขาย…</p>;
  return <SaleScreenInner ctx={ctx} />;
}

function loadCart(key: string, catalog: Map<string, CatalogItem>): CartLine[] {
  try {
    return sanitizeStoredCart(JSON.parse(localStorage.getItem(key) ?? "null"), catalog);
  } catch {
    return []; // ไม่มีที่เก็บในเครื่อง ใช้ตะกร้าว่าง
  }
}

function SaleScreenInner({ ctx }: { ctx: PosContext }) {
  const catalog = useMemo(() => new Map(ctx.items.map((i) => [i.skuId, i])), [ctx.items]);
  const storageKey = `onemart.cart.${ctx.store.id}`;
  const [lines, dispatch] = useReducer(cartReducer, null, () => loadCart(storageKey, catalog));
  const [scan, setScan] = useState("");
  const [query, setQuery] = useState("");
  const [camera, setCamera] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [mode, setMode] = useState<"sale" | "pay">("sale"); // P2 ขาย → P3 รับเงิน
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(lines)); } catch { /* เก็บไม่ได้ก็ใช้ต่อได้ */ }
  }, [lines, storageKey]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  function addItem(item: CatalogItem, qty = 1) {
    dispatch({ type: "add", skuId: item.skuId, qty });
    setNotice({ kind: "ok", text: `เพิ่ม ${item.name} ×${qty}` });
  }

  function handleCode(raw: string) {
    const hit = lookupBarcode(ctx.barcodes, raw);
    const item = hit && catalog.get(hit.skuId);
    if (!hit || !item) {
      navigator.vibrate?.([80, 60, 80]);
      setNotice({ kind: "warn", text: `ไม่พบสินค้า รหัส ${raw.trim()} — ลองค้นหาด้วยชื่อ` });
      return;
    }
    addItem(item, hit.qty);
  }

  const results = searchCatalog(ctx.items, query);
  const total = cartTotalSatang(lines, catalog);
  const count = cartItemCount(lines);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{ctx.store.name}</div>
          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">POS · เฟสถัดไป</span>
        </div>
        <form action={logout}>
          <button className="min-h-12 px-3 text-sm text-zinc-600">ออกจากระบบ</button>
        </form>
      </header>

      {mode === "pay" ? (
        <PayPanel
          store={ctx.store}
          lines={lines}
          totalSatang={total}
          onBack={() => setMode("sale")}
          // Next เก็บ state ของหน้า /pos ไว้ตอนไปหน้าใบเสร็จ → ต้องกลับเป็นโหมดขาย ไม่งั้นกลับมาเจอหน้ารับเงินค้าง
          onPaid={() => { dispatch({ type: "clear" }); setMode("sale"); }}
        />
      ) : (
      <>
      <section className="flex flex-col gap-2 px-3 pt-3">
        {/* รับรหัสจากเครื่องสแกนในตัว (ส่งมาเหมือนพิมพ์ + Enter) · inputMode none = ไม่เด้งคีย์บอร์ด */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (scan.trim()) handleCode(scan);
            setScan("");
          }}
          className="flex gap-2"
        >
          <input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            inputMode="none"
            autoFocus
            placeholder="สแกนบาร์โค้ด"
            aria-label="ช่องรับบาร์โค้ด"
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 text-lg"
          />
          <button
            type="button"
            onClick={() => setCamera((c) => !c)}
            className="min-h-12 rounded-lg bg-zinc-900 px-4 font-semibold text-white"
          >
            {camera ? "ปิดกล้อง" : "กล้อง"}
          </button>
        </form>

        {camera && <CameraScanner onCode={handleCode} onClose={() => setCamera(false)} />}

        <div
          role="status"
          className={`min-h-8 rounded px-2 py-1 text-sm ${
            notice?.kind === "warn" ? "bg-orange-100 text-orange-900" : notice ? "bg-emerald-100 text-emerald-900" : ""
          }`}
        >
          {notice?.text}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="ค้นหาชื่อสินค้า"
          className="min-h-12 rounded-lg border border-zinc-300 px-3 text-lg"
        />
      </section>

      {query.trim() ? (
        <ul className="flex flex-col gap-1 px-3 pt-2">
          {results.length === 0 && <li className="py-3 text-zinc-500">ไม่พบสินค้าที่ชื่อตรงกับ “{query}”</li>}
          {results.map((it) => (
            <li key={it.skuId}>
              <button
                onClick={() => { addItem(it); setQuery(""); scanRef.current?.focus(); }}
                className="flex min-h-12 w-full items-center justify-between rounded-lg border border-zinc-200 px-3 text-left active:bg-zinc-100"
              >
                <span>{it.name} <span className="text-sm text-zinc-500">{it.sizeDesc}</span></span>
                <span className="text-xl font-semibold tabular-nums">{formatBaht(Math.round(it.price * 100))}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section className="grid grid-cols-4 gap-2 px-3 pt-2" aria-label="ปุ่มลัดสินค้าขายดี">
          {ctx.bestSkuIds.map((id) => {
            const it = catalog.get(id)!;
            return (
              <button
                key={id}
                onClick={() => { addItem(it); scanRef.current?.focus(); }}
                className="flex min-h-16 flex-col items-center justify-center rounded-lg bg-amber-50 p-1 text-center text-xs leading-tight ring-1 ring-amber-200 active:bg-amber-200"
              >
                <span className="line-clamp-2">{it.name}</span>
                <span className="text-sm font-semibold tabular-nums">{formatBaht(Math.round(it.price * 100))}</span>
              </button>
            );
          })}
        </section>
      )}

      <section className="flex flex-1 flex-col gap-1 px-3 pb-40 pt-3" aria-label="ตะกร้า">
        {lines.length === 0 && <p className="py-6 text-center text-zinc-400">ยังไม่มีสินค้าในตะกร้า</p>}
        {lines.map((l) => {
          const it = catalog.get(l.skuId)!;
          return (
            <div key={l.skuId} className="flex items-center gap-2 border-b border-zinc-100 py-1">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{it.name} <span className="text-sm text-zinc-500">{it.sizeDesc}</span></div>
                <div className="text-sm text-zinc-500 tabular-nums">
                  {formatBaht(Math.round(it.price * 100))} × {l.qty}
                  {l.qty > it.stock && <span className="ml-2 text-orange-700">เกินสต๊อกในระบบ ({it.stock})</span>}
                </div>
              </div>
              <button aria-label={`ลด ${it.name}`} onClick={() => dispatch({ type: "dec", skuId: l.skuId })}
                className="h-12 w-12 rounded-lg bg-zinc-100 text-2xl font-bold active:bg-zinc-300">−</button>
              <span className="w-8 text-center text-xl font-semibold tabular-nums">{l.qty}</span>
              <button aria-label={`เพิ่ม ${it.name}`} onClick={() => dispatch({ type: "inc", skuId: l.skuId })}
                className="h-12 w-12 rounded-lg bg-zinc-100 text-2xl font-bold active:bg-zinc-300">+</button>
              <span className="w-20 text-right text-xl font-semibold tabular-nums">{formatBaht(lineTotalSatang(l, it))}</span>
            </div>
          );
        })}
        {lines.length > 0 && (
          <button onClick={() => dispatch({ type: "clear" })} className="mt-2 min-h-12 self-start px-2 text-sm text-red-700">
            ล้างตะกร้า
          </button>
        )}
      </section>

      <footer className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-3 py-3">
          <div className="flex-1">
            <div className="text-sm text-zinc-500">{count} ชิ้น · ยอดรวม (บาท)</div>
            <div className="text-4xl font-bold tabular-nums" aria-label="ยอดรวม">{formatBaht(total)}</div>
          </div>
          <button
            disabled={lines.length === 0}
            onClick={() => { setCamera(false); setMode("pay"); }}
            className="min-h-16 rounded-xl bg-emerald-600 px-6 text-xl font-bold text-white disabled:opacity-40"
          >
            รับเงิน
          </button>
        </div>
      </footer>
      </>
      )}
    </main>
  );
}
