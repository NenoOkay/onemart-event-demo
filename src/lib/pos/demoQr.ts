// ภาพ "คล้าย QR" สำหรับเดโม PromptPay — ตั้งใจให้สแกนไม่ได้ (กติกาเฉพาะ Event)
// · ไม่มีข้อมูลใดเข้ารหัสอยู่ (ลายสุ่มแบบคงที่) · ไม่มี PromptPay ID
// · มีจุดมุมแค่ 2 มุม (ขาดมุมล่างซ้าย) เครื่องอ่าน QR จึงหาตำแหน่งไม่เจอ
// ฟังก์ชันล้วน ไม่มี import — ทดสอบด้วย node --test (ZXing ต้องถอดไม่ได้)

export const DEMO_QR_SIZE = 25; // จำนวนช่อง

export function demoQrModules(seed = 20261030): boolean[][] {
  let a = seed | 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = DEMO_QR_SIZE;
  const m = Array.from({ length: n }, () => Array.from({ length: n }, () => rand() < 0.5));

  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      m[rr][cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2;
    }
  };
  finder(0, 0);
  finder(0, n - 7);
  // มุมล่างซ้ายเว้นไว้เป็นลายสุ่ม (ตั้งใจ)
  return m;
}

export function demoQrSvg(px = 220): string {
  const m = demoQrModules();
  const n = m.length, q = 2, cell = px / (n + q * 2);
  let rects = "";
  m.forEach((row, r) => row.forEach((on, c) => {
    if (on) rects += `<rect x="${((c + q) * cell).toFixed(2)}" y="${((r + q) * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" role="img" aria-label="QR ตัวอย่าง สแกนจ่ายไม่ได้">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#1f2937">${rects}</g></svg>`;
}
