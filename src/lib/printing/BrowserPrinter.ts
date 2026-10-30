import type { PrinterAdapter, PrintResult, ReceiptDoc } from "./PrinterAdapter";
import { receiptHtml, RECEIPT_CSS } from "./receipt";

// พิมพ์ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์ (PC / Chrome) · กระดาษ 58 mm
// ในแอป Android (WebView) ไม่มีหน้าต่างพิมพ์ → แสดงตัวอย่างบนจออย่างเดียว
export class BrowserPrinter implements PrinterAdapter {
  readonly name = "BrowserPrinter";

  async isAvailable(): Promise<boolean> {
    const native = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
    return typeof window.print === "function" && !native;
  }

  async print(doc: ReceiptDoc): Promise<PrintResult> {
    if (!(await this.isAvailable())) return { printed: false, note: "เครื่องนี้แสดงตัวอย่างใบเสร็จเท่านั้น" };

    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const w = frame.contentWindow!;
    w.document.open();
    w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
      @page { size: 58mm auto; margin: 2mm 5mm; } body { margin: 0; } ${RECEIPT_CSS}
    </style></head><body><div class="rc">${receiptHtml(doc)}</div></body></html>`);
    w.document.close();
    await new Promise((r) => setTimeout(r, 100)); // รอฟอนต์/layout
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 1000);
    return { printed: true };
  }
}
