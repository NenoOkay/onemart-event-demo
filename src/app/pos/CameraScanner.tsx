"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const SAME_CODE_COOLDOWN_MS = 1500; // กันสแกนซ้ำรหัสเดิมขณะกล้องยังจ่ออยู่

// สแกนต่อเนื่องด้วยกล้องหลัง จนกว่าจะกดปิด
export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
    ]]]);
    const reader = new BrowserMultiFormatReader(hints);
    let controls: IScannerControls | undefined;
    let cancelled = false;
    let last = { code: "", at: 0 };

    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        if (code === last.code && now - last.at < SAME_CODE_COOLDOWN_MS) return;
        last = { code, at: now };
        navigator.vibrate?.(60);
        onCodeRef.current(code);
      })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch(() => setError("เปิดกล้องไม่ได้ — ตรวจว่าอนุญาตให้แอปใช้กล้องแล้ว"));

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-black p-2">
      {error ? (
        <p className="p-4 text-center text-white">{error}</p>
      ) : (
        <video ref={videoRef} className="aspect-[4/3] w-full rounded object-cover" muted playsInline />
      )}
      <button onClick={onClose} className="min-h-12 rounded bg-white text-lg font-semibold">
        ปิดกล้อง
      </button>
    </div>
  );
}
