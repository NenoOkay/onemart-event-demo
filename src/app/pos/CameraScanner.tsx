"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

// รหัสเดิมนับใหม่ได้เมื่อบาร์โค้ดออกจากกล้องไปแล้วนานเท่านี้ (จ่อค้างไว้ = นับครั้งเดียว เหมือนเครื่องยิง)
const SAME_CODE_REARM_MS = 1000;

// เสียง "ปี๊บ" แบบเครื่องยิงบาร์โค้ด (Web Audio · ไม่ต้องมีไฟล์เสียง)
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  void ctx.resume();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 2400;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.08);
}

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
    let last = { code: "", seenAt: 0 };
    let audio: AudioContext | null = null;
    try { audio = new AudioContext(); } catch { /* ไม่มีเสียงก็ยังสั่นได้ */ }

    reader
      .decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        const held = code === last.code && now - last.seenAt < SAME_CODE_REARM_MS;
        last = { code, seenAt: now }; // ยังเห็นอยู่ = ต่อเวลาไปเรื่อย ๆ
        if (held) return;
        beep(audio);
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
      void audio?.close();
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
