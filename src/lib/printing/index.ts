import type { PrinterAdapter } from "./PrinterAdapter";
import { BrowserPrinter } from "./BrowserPrinter";

// เลือกเครื่องพิมพ์ที่ใช้ได้ · วันที่ 5 เพิ่ม SunmiPrinter ไว้ก่อน BrowserPrinter
export async function getPrinter(): Promise<PrinterAdapter> {
  const candidates: PrinterAdapter[] = [new BrowserPrinter()];
  for (const p of candidates) if (await p.isAvailable()) return p;
  return candidates[candidates.length - 1];
}

export type { PrinterAdapter, ReceiptDoc, PrintResult } from "./PrinterAdapter";
