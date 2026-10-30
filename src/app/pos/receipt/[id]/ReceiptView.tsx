"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buildReceipt, receiptHtml, RECEIPT_CSS, type ReceiptSale } from "@/lib/printing/receipt";
import { getPrinter } from "@/lib/printing";

export function ReceiptView({ receipt, autoPrint }: { receipt: ReceiptSale; autoPrint: boolean }) {
  const doc = useMemo(() => buildReceipt(receipt), [receipt]);
  const html = useMemo(() => receiptHtml(doc), [doc]);
  const [status, setStatus] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const printedOnce = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  async function print() {
    setPrinting(true);
    try {
      const printer = await getPrinter();
      const res = await printer.print(doc);
      setStatus(res.printed ? `ส่งพิมพ์แล้ว (${printer.name})` : res.note ?? "พิมพ์ไม่ได้");
    } catch (e) {
      setStatus(`พิมพ์ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  }

  // พิมพ์อัตโนมัติ 1 ครั้งหลังขาย แล้วเอา ?new=1 ออก (รีโหลดแล้วไม่พิมพ์ซ้ำเอง)
  useEffect(() => {
    if (!autoPrint || printedOnce.current) return;
    printedOnce.current = true;
    print().finally(() => router.replace(pathname));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-3">
      <style>{RECEIPT_CSS}</style>
      <h1 className="text-lg font-bold">ใบเสร็จ</h1>
      <div className="rounded-lg border border-zinc-300 bg-white py-3 shadow-sm">
        <div className="rc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <p role="status" className="min-h-6 text-center text-sm text-zinc-600">{printing ? "กำลังพิมพ์…" : status}</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={print} disabled={printing}
          className="min-h-14 rounded-xl bg-zinc-100 text-lg font-semibold active:bg-zinc-300 disabled:opacity-50">
          พิมพ์ซ้ำ
        </button>
        <Link href="/pos" className="flex min-h-14 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
          ขายบิลถัดไป
        </Link>
      </div>
    </main>
  );
}
