// ใช้หลัง Tailwind (ดู next.config.ts): แปลง @layer เป็น CSS ธรรมดาให้ WebView Chrome 91 บน Sunmi V2s
const config = {
  plugins: { "@csstools/postcss-cascade-layers": {} },
};

export default config;
