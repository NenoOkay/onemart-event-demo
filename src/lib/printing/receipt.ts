// สร้างใบเสร็จสาธิต (P4) จากบิลในฐานข้อมูล — ฟังก์ชันล้วน ทดสอบด้วย node --test ได้
// ไม่มีบรรทัด VAT: สถานะ VAT ยังรอฝ่ายบัญชี (PL2-12 ห้ามระบบสมมติ VAT)
import type { ReceiptDoc, ReceiptLine } from "./PrinterAdapter";

export type ReceiptSale = {
  storeName: string;
  billNo: string;
  soldAt: string; // ISO
  paymentMethod: "cash" | "promptpay_demo";
  total: number;
  cashReceived: number | null;
  change: number | null;
  lines: { name: string; sizeDesc: string; qty: number; unitPrice: number; lineTotal: number }[];
};

export const RECEIPT_WIDTH = 32;

// สระบน/ล่าง ไม้หันอากาศ และวรรณยุกต์ไทย ไม่กินความกว้างบนกระดาษ
const THAI_COMBINING = /[ัิ-ฺ็-๎]/;

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) if (!THAI_COMBINING.test(ch)) w++;
  return w;
}

// ตัดให้ยาวไม่เกิน max (นับแบบ displayWidth) · ไม่ตัดกลางตัวอักษรที่มีสระ/วรรณยุกต์ซ้อน
export function truncate(s: string, max: number): string {
  if (displayWidth(s) <= max) return s;
  let out = "", w = 0;
  for (const ch of s) {
    const cw = THAI_COMBINING.test(ch) ? 0 : 1;
    if (w + cw > max - 1) break;
    out += ch; w += cw;
  }
  return out + "…";
}

// แถวซ้าย-ขวาเป็นข้อความความกว้างคงที่ (ใช้กับเครื่องพิมพ์แบบตัวอักษร)
export function padRow(left: string, right: string, width = RECEIPT_WIDTH): string {
  const l = truncate(left, Math.max(1, width - displayWidth(right) - 1));
  return l + " ".repeat(Math.max(1, width - displayWidth(l) - displayWidth(right))) + right;
}

export const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// วันเวลาไทย (พ.ศ.) แบบคงที่ ไม่ขึ้นกับ locale ของเครื่อง
export function formatThaiDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear() + 543} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function buildReceipt(sale: ReceiptSale): ReceiptDoc {
  const lines: ReceiptLine[] = [
    { kind: "text", text: "ใบเสร็จสาธิต", align: "center", bold: true, size: "large" },
    { kind: "text", text: "ข้อมูลจำลองเพื่อการสาธิต", align: "center" },
    { kind: "divider" },
    { kind: "text", text: sale.storeName, align: "center", bold: true },
    { kind: "row", left: "เลขที่", right: sale.billNo },
    { kind: "row", left: "วันที่", right: formatThaiDateTime(sale.soldAt) },
    { kind: "divider" },
  ];
  for (const l of sale.lines) {
    lines.push({ kind: "text", text: `${l.name} ${l.sizeDesc}` });
    lines.push({ kind: "row", left: `  ${l.qty} x ${baht(l.unitPrice)}`, right: baht(l.lineTotal) });
  }
  const count = sale.lines.reduce((n, l) => n + l.qty, 0);
  lines.push(
    { kind: "divider" },
    { kind: "row", left: `รวม ${count} ชิ้น`, right: baht(sale.total), bold: true },
  );
  if (sale.paymentMethod === "cash") {
    lines.push(
      { kind: "row", left: "รับเงินสด", right: baht(sale.cashReceived ?? 0) },
      { kind: "row", left: "เงินทอน", right: baht(sale.change ?? 0) },
    );
  } else {
    lines.push({ kind: "row", left: "ชำระด้วย", right: "PromptPay (สาธิต)" });
  }
  lines.push(
    { kind: "divider" },
    { kind: "text", text: "ไม่ใช่ใบกำกับภาษี", align: "center" },
    { kind: "text", text: "ขอบคุณที่ใช้บริการ", align: "center" },
    { kind: "feed", lines: 3 },
  );
  return { widthChars: RECEIPT_WIDTH, lines };
}

// ข้อความล้วนความกว้างคงที่ (ตัวอย่างใน log · BluetoothPrinter แบบ ESC/POS)
export function renderText(doc: ReceiptDoc): string[] {
  const w = doc.widthChars;
  const center = (s: string) => {
    const t = truncate(s, w);
    return " ".repeat(Math.floor((w - displayWidth(t)) / 2)) + t;
  };
  const out: string[] = [];
  for (const l of doc.lines) {
    if (l.kind === "divider") out.push("-".repeat(w));
    else if (l.kind === "feed") for (let i = 0; i < l.lines; i++) out.push("");
    else if (l.kind === "row") out.push(padRow(l.left, l.right, w));
    else if (l.align === "center") out.push(center(l.text));
    else if (l.align === "right") { const t = truncate(l.text, w); out.push(" ".repeat(w - displayWidth(t)) + t); }
    else out.push(truncate(l.text, w));
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// HTML สำหรับแสดงตัวอย่างบนจอ และ BrowserPrinter
export function receiptHtml(doc: ReceiptDoc): string {
  return doc.lines.map((l) => {
    if (l.kind === "divider") return `<div class="rc-div"></div>`;
    if (l.kind === "feed") return `<div style="height:${l.lines}em"></div>`;
    const cls = `${"bold" in l && l.bold ? " rc-b" : ""}`;
    if (l.kind === "row") return `<div class="rc-row${cls}"><span>${esc(l.left)}</span><span>${esc(l.right)}</span></div>`;
    return `<div class="rc-t${cls}${l.size === "large" ? " rc-l" : ""}" style="text-align:${l.align ?? "left"}">${esc(l.text)}</div>`;
  }).join("");
}

export const RECEIPT_CSS = `
.rc{width:48mm;margin:0 auto;font:12px/1.35 sans-serif;color:#000;background:#fff}
.rc-row{display:flex;justify-content:space-between;gap:6px}.rc-row span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-row span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
.rc-b{font-weight:700}.rc-l{font-size:16px}.rc-div{border-top:1px dashed #000;margin:4px 0}`;
