import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PrinterAdapter, PrintResult, ReceiptDoc } from "./PrinterAdapter";
import { renderReceiptPng } from "./renderBitmap";

// ปลั๊กอินฝั่งเครื่อง: android/app/src/main/java/com/onemart/eventdemo/SunmiPrinterPlugin.java
type Native = {
  status(): Promise<{ connected: boolean; state: number }>;
  printImage(o: { base64: string; feedLines: number }): Promise<void>;
};
const native = registerPlugin<Native>("SunmiPrinter");

// รหัสสถานะจากบริการเครื่องพิมพ์ Sunmi (updatePrinterState)
export function sunmiStateMessage(state: number): string {
  switch (state) {
    case 1: return "เครื่องพิมพ์พร้อม";
    case 2: return "เครื่องพิมพ์กำลังเริ่มทำงาน — รอสักครู่แล้วกดพิมพ์ซ้ำ";
    case 4: return "กระดาษหมด — ใส่กระดาษแล้วกดพิมพ์ซ้ำ";
    case 5: return "เครื่องพิมพ์ร้อนเกิน — รอสักครู่แล้วกดพิมพ์ซ้ำ";
    case 6: return "ฝาเครื่องพิมพ์เปิดอยู่ — ปิดฝาแล้วกดพิมพ์ซ้ำ";
    case -1: case 505: return "ไม่พบเครื่องพิมพ์ Sunmi — แสดงตัวอย่างบนจอเท่านั้น";
    default: return `เครื่องพิมพ์ไม่พร้อม (รหัส ${state}) — กดพิมพ์ซ้ำ`;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SunmiPrinter implements PrinterAdapter {
  readonly name = "SunmiPrinter";

  // มีปลั๊กอินใน APK = เลือกตัวนี้ · ถ้าเครื่องไม่ใช่ Sunmi จะแจ้งตอนพิมพ์ (ไม่สลับไปหน้าต่างพิมพ์ของเบราว์เซอร์)
  async isAvailable(): Promise<boolean> {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SunmiPrinter");
  }

  async print(doc: ReceiptDoc): Promise<PrintResult> {
    let st = await native.status();
    if (!st.connected) { await wait(800); st = await native.status(); } // บริการเพิ่งเปิดแอปอาจยังเชื่อมไม่เสร็จ
    if (!st.connected) return { printed: false, note: sunmiStateMessage(-1) };
    if (st.state !== 1) return { printed: false, note: sunmiStateMessage(st.state) };

    const img = await renderReceiptPng(doc);
    try {
      await native.printImage(img);
      return { printed: true };
    } catch (e) {
      const state = (e as { data?: { state?: number } }).data?.state;
      return { printed: false, note: typeof state === "number" && state !== 1 ? sunmiStateMessage(state) : `พิมพ์ไม่สำเร็จ — กดพิมพ์ซ้ำ (${(e as Error).message})` };
    }
  }
}
