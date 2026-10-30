"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { loginWithPin } from "./actions";

type LoginStore = { code: string; name: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function LoginForm() {
  const [stores, setStores] = useState<LoginStore[] | null>(null);
  const [storeCode, setStoreCode] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    createClient()
      .rpc("pos_login_stores")
      .then(({ data, error }) => {
        if (error) setError("โหลดรายชื่อร้านไม่ได้ — ตรวจการเชื่อมต่อเน็ต");
        setStores((data as LoginStore[]) ?? []);
      });
  }, []);

  function press(key: string) {
    setError(null);
    if (key === "del") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 4 || !storeCode) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      startTransition(async () => {
        const res = await loginWithPin(storeCode, next);
        if (res?.error) {
          setError(res.error);
          setPin("");
        }
      });
    }
  }

  if (!stores) return <p className="text-zinc-500">กำลังโหลดรายชื่อร้าน…</p>;

  if (!storeCode) {
    return (
      <section className="flex flex-col gap-2">
        <p className="text-zinc-600">เลือกร้าน</p>
        {stores.map((s) => (
          <button
            key={s.code}
            onClick={() => setStoreCode(s.code)}
            className="min-h-14 rounded-lg border border-zinc-300 px-4 text-left text-lg font-semibold active:bg-zinc-100"
          >
            {s.name}
          </button>
        ))}
        {error && <p className="text-red-600">{error}</p>}
      </section>
    );
  }

  const storeName = stores.find((s) => s.code === storeCode)?.name;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{storeName}</span>
        <button
          onClick={() => { setStoreCode(null); setPin(""); setError(null); }}
          className="min-h-12 px-3 text-sky-700"
        >
          เปลี่ยนร้าน
        </button>
      </div>
      <p className="text-center text-zinc-600">ใส่ PIN 4 หลัก</p>
      <div className="flex justify-center gap-4" aria-label={`ใส่แล้ว ${pin.length} หลัก`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 border-zinc-700 ${i < pin.length ? "bg-zinc-700" : ""}`} />
        ))}
      </div>
      <p className="min-h-6 text-center text-red-600" role="alert">{pending ? "" : error}</p>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              disabled={pending}
              onClick={() => press(k)}
              className="min-h-16 rounded-xl bg-zinc-100 text-2xl font-semibold active:bg-zinc-300 disabled:opacity-50"
            >
              {k === "del" ? "ลบ" : k}
            </button>
          ),
        )}
      </div>
      {pending && <p className="text-center text-zinc-500">กำลังเข้าสู่ระบบ…</p>}
    </section>
  );
}
