// interface กลางของเครื่องพิมพ์ใบเสร็จ 58 mm
// BrowserPrinter (พัฒนา/ทดสอบ) · SunmiPrinter (วันที่ 5) · BluetoothPrinter (สำรอง)
// ใบเสร็จเป็นเอกสารมีโครงสร้าง ไม่ใช่ HTML — แต่ละ adapter แปลงเป็นคำสั่งเครื่องพิมพ์ของตัวเอง

export type Align = "left" | "center" | "right";

export type ReceiptLine =
  | { kind: "text"; text: string; align?: Align; bold?: boolean; size?: "normal" | "large" }
  | { kind: "row"; left: string; right: string; bold?: boolean } // ซ้าย-ขวา ในบรรทัดเดียว
  | { kind: "divider" }
  | { kind: "feed"; lines: number };

export type ReceiptDoc = {
  widthChars: number; // 58 mm ≈ 32 ตัวอักษร (ฟอนต์ปกติ)
  lines: ReceiptLine[];
};

export type PrintResult = { printed: boolean; note?: string };

export interface PrinterAdapter {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  print(doc: ReceiptDoc): Promise<PrintResult>;
}
