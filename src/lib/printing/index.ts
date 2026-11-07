import type { PrinterAdapter } from "./PrinterAdapter";
import { BrowserPrinter } from "./BrowserPrinter";
import { SunmiPrinter } from "./SunmiPrinter";

// เลือกเครื่องพิมพ์ที่ใช้ได้ตามลำดับ: Sunmi (แอปบนเครื่อง) → หน้าต่างพิมพ์ของเบราว์เซอร์
export async function getPrinter(): Promise<PrinterAdapter> {
  const candidates: PrinterAdapter[] = [new SunmiPrinter(), new BrowserPrinter()];
  for (const p of candidates) if (await p.isAvailable()) return p;
  return candidates[candidates.length - 1];
}

export type { PrinterAdapter, ReceiptDoc, PrintResult } from "./PrinterAdapter";
