import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: "ONE MART — เดโม",
  description: "ระบบสาธิต ONE MART · ข้อมูลจำลองเพื่อการสาธิต",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${notoSansThai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
