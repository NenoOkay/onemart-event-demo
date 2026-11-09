// สร้างไอคอนแอป Android + splash + favicon + โลโก้ใบเสร็จ จากไฟล์แบรนด์ (EV-12)
// รัน: npm run brand-icons   (ต้นฉบับ: public/brand/icon.png = om_icon · logo-color.svg · logo-mono.svg)
// ไอคอนแบบ adaptive: พื้นม่วงไล่เฉด (drawable/ic_launcher_background.xml) + เครื่องหมาย "1" สีส้ม (foreground)
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const RES = here("../android/app/src/main/res/");
const PURPLE = "#77018d", PURPLE_DARK = "#5b006e";
const ORANGE = { r: 0xfb, g: 0xb0, b: 0x3b };

// แยกเครื่องหมายสีส้มออกจากพื้นม่วงของ om_icon: ช่องแดงของม่วง ≈ 90–120 · ส้ม = 251 → ใช้เป็นค่าโปร่งใส
async function orangeMark(): Promise<Buffer> {
  const { data, info } = await sharp(here("../public/brand/icon.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4], a = data[i * 4 + 3];
    const t = Math.max(0, Math.min(1, (r - 130) / (245 - 130)));
    out.set([ORANGE.r, ORANGE.g, ORANGE.b, Math.round(t * a)], i * 4);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();
}

const gradientSvg = (size: number, shape: string) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PURPLE}"/><stop offset="1" stop-color="${PURPLE_DARK}"/></linearGradient></defs>
    ${shape.replace("FILL", 'fill="url(#g)"')}
  </svg>`);

// ไอคอนเต็ม: พื้นม่วง (สี่เหลี่ยมโค้งหรือวงกลม) + เครื่องหมายส้มกว้าง markRatio ของขนาด
async function fullIcon(mark: Buffer, size: number, round: boolean, markRatio: number) {
  const shape = round
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" FILL/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.2}" FILL/>`;
  const m = await sharp(mark).resize(Math.round(size * markRatio), Math.round(size * markRatio), { fit: "contain", background: "#0000" }).toBuffer();
  return sharp(gradientSvg(size, shape)).composite([{ input: m, gravity: "center" }]).png().toBuffer();
}

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;

const mark = await orangeMark();
for (const [d, k] of Object.entries(DENSITY)) {
  const dir = `${RES}mipmap-${d}/`;
  await sharp(await fullIcon(mark, 48 * k, false, 0.72)).toFile(`${dir}ic_launcher.png`);
  await sharp(await fullIcon(mark, 48 * k, true, 0.66)).toFile(`${dir}ic_launcher_round.png`);
  // foreground 108dp · เขตปลอดภัยวงกลม 66dp → เครื่องหมายกว้าง 58dp
  const fg = Math.round(108 * k), mk = Math.round(58 * k);
  await sharp({ create: { width: fg, height: fg, channels: 4, background: "#0000" } })
    .composite([{ input: await sharp(mark).resize(mk, mk, { fit: "contain", background: "#0000" }).toBuffer(), gravity: "center" }])
    .png().toFile(`${dir}ic_launcher_foreground.png`);
}

// splash: พื้นขาว + โลโก้สีกว้าง 50% ของด้านสั้น
const SPLASH: [string, number, number][] = [
  ["drawable", 480, 320],
  ["drawable-land-mdpi", 480, 320], ["drawable-land-hdpi", 800, 480], ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960], ["drawable-land-xxxhdpi", 1920, 1280],
  ["drawable-port-mdpi", 320, 480], ["drawable-port-hdpi", 480, 800], ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600], ["drawable-port-xxxhdpi", 1280, 1920],
];
for (const [dir, w, h] of SPLASH) {
  const logo = await sharp(here("../public/brand/logo-color.svg"), { density: 600 }).resize(Math.round(Math.min(w, h) * 0.5)).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: "#ffffff" } })
    .composite([{ input: logo, gravity: "center" }]).png().toFile(`${RES}${dir}/splash.png`);
}

// โลโก้หัวใบเสร็จ: ขาวดำล้วน (1 บิต) ขนาดเท่าจุดพิมพ์จริง 240×120 (RECEIPT_LOGO ใน receipt.ts)
{
  const { data, info } = await sharp(here("../public/brand/logo-mono.svg"), { density: 300 })
    .resize(240, 120, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  await sharp(Buffer.from(data.map((v) => (v < 140 ? 0 : 255))), { raw: { width: info.width, height: info.height, channels: 1 } })
    .png().toFile(here("../public/brand/logo-receipt.png"));
}

// favicon ของเว็บ (Next.js ใช้ src/app/icon.png อัตโนมัติ)
await sharp(await fullIcon(mark, 512, false, 0.72)).toFile(here("../src/app/icon.png"));
console.log("สร้างไอคอน + splash + favicon แล้ว");
