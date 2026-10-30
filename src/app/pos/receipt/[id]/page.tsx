import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReceiptSale } from "@/lib/printing/receipt";
import { ReceiptView } from "./ReceiptView";

// P4 ใบเสร็จ — อ่านจากบิลที่บันทึกแล้วในฐานข้อมูล (RLS: เห็นเฉพาะบิลร้านตน)
export default function ReceiptPage(props: PageProps<"/pos/receipt/[id]">) {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">กำลังโหลดใบเสร็จ…</p>}>
      <ReceiptLoader {...props} />
    </Suspense>
  );
}

type LineRow = {
  qty_units: number;
  retail_price_per_unit: number;
  line_total: number;
  sku: { size_desc: string; product: { name_th: string } | null } | null;
};

async function ReceiptLoader({ params, searchParams }: PageProps<"/pos/receipt/[id]">) {
  await connection();
  const { id } = await params;
  const autoPrint = (await searchParams).new === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/pos/login");

  const { data: sale } = await supabase
    .from("pos_sale")
    .select(`external_txn_id, sold_at, payment_method, total_amount, cash_received, change_amount,
             store:store_id (name),
             lines:pos_sale_line (qty_units, retail_price_per_unit, line_total, sku:sku_id (size_desc, product:product_id (name_th)))`)
    .eq("id", id)
    .single();
  if (!sale) notFound();

  const receipt: ReceiptSale = {
    storeName: (sale.store as unknown as { name: string } | null)?.name ?? "",
    billNo: sale.external_txn_id,
    soldAt: sale.sold_at,
    paymentMethod: sale.payment_method,
    total: Number(sale.total_amount),
    cashReceived: sale.cash_received === null ? null : Number(sale.cash_received),
    change: sale.change_amount === null ? null : Number(sale.change_amount),
    lines: (sale.lines as unknown as LineRow[]).map((l) => ({
      name: l.sku?.product?.name_th ?? "",
      sizeDesc: l.sku?.size_desc ?? "",
      qty: l.qty_units,
      unitPrice: Number(l.retail_price_per_unit),
      lineTotal: Number(l.line_total),
    })),
  };
  return <ReceiptView receipt={receipt} autoPrint={autoPrint} />;
}
