// วาดใบเสร็จเป็นภาพสำหรับเครื่องพิมพ์ความร้อน 58 mm (กว้าง 384 จุด)
// พิมพ์เป็นภาพแทนตัวอักษร: ฟอนต์ในเครื่องพิมพ์วางสระ/วรรณยุกต์ไทยไม่ถูก ภาพจึงตรงกับตัวอย่างบนจอ
import type { ReceiptDoc } from "./PrinterAdapter";

export const PAPER_DOTS = 384;
const PAD = 4, FONT = 22, FONT_LARGE = 30, LINE = 1.4, DIV_H = 14;
const font = (px: number, bold?: boolean) => `${bold ? "700 " : ""}${px}px sans-serif`;

export type Measure = (text: string, font: string) => number;

export type DrawOp =
  | { op: "text"; text: string; x: number; y: number; font: string; align: "left" | "right" | "center" }
  | { op: "line"; y: number };

// ตัดข้อความให้ไม่เกินความกว้าง (px) แล้วต่อ …
export function fit(text: string, max: number, f: string, measure: Measure): string {
  if (measure(text, f) <= max) return text;
  const chars = [...text];
  while (chars.length && measure(chars.join("") + "…", f) > max) chars.pop();
  return chars.join("") + "…";
}

// จัดหน้าเป็นคำสั่งวาด (ฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องมี canvas) · feed ส่งให้เครื่องพิมพ์ป้อนกระดาษเอง
export function layoutReceipt(doc: ReceiptDoc, measure: Measure, width = PAPER_DOTS) {
  const ops: DrawOp[] = [];
  const inner = width - PAD * 2;
  let y = PAD, feedLines = 0;
  for (const l of doc.lines) {
    if (l.kind === "feed") { feedLines += l.lines; continue; }
    if (l.kind === "divider") { ops.push({ op: "line", y: y + DIV_H / 2 }); y += DIV_H; continue; }
    const px = l.kind === "text" && l.size === "large" ? FONT_LARGE : FONT;
    const f = font(px, l.bold);
    if (l.kind === "row") {
      const rw = measure(l.right, f);
      ops.push({ op: "text", text: fit(l.left, inner - rw - 8, f, measure), x: PAD, y, font: f, align: "left" });
      ops.push({ op: "text", text: l.right, x: width - PAD, y, font: f, align: "right" });
    } else {
      const align = l.align ?? "left";
      const x = align === "center" ? width / 2 : align === "right" ? width - PAD : PAD;
      ops.push({ op: "text", text: fit(l.text, inner, f, measure), x, y, font: f, align });
    }
    y += Math.round(px * LINE);
  }
  return { ops, height: y + PAD, width, feedLines };
}

// คืน PNG แบบ base64 (ไม่มีหัว data:) + จำนวนบรรทัดที่ต้องป้อนกระดาษ
export async function renderReceiptPng(doc: ReceiptDoc): Promise<{ base64: string; feedLines: number }> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const measure: Measure = (t, f) => { ctx.font = f; return ctx.measureText(t).width; };
  const { ops, height, width, feedLines } = layoutReceipt(doc, measure);

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = ctx.strokeStyle = "#000";
  ctx.textBaseline = "top";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  for (const o of ops) {
    if (o.op === "line") {
      ctx.beginPath(); ctx.moveTo(PAD, o.y); ctx.lineTo(width - PAD, o.y); ctx.stroke();
    } else {
      ctx.font = o.font; ctx.textAlign = o.align; ctx.fillText(o.text, o.x, o.y);
    }
  }
  return { base64: canvas.toDataURL("image/png").split(",")[1], feedLines };
}
