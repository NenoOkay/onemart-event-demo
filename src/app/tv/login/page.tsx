"use client";

import { useState, useTransition } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { loginTv } from "./actions";

export default function TvLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await loginTv(password);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-tv-bg p-8 text-zinc-900">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
        <BrandLogo className="h-20 self-start" />
        <h1 className="text-2xl font-bold text-brand-dark">เข้าสู่ระบบจอทีวี</h1>
        <p className="text-tv-muted">บัญชีผู้บริหาร (เดโม)</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          placeholder="รหัสผ่าน"
          className="min-h-12 rounded-lg bg-brand-soft px-4 text-lg outline-none ring-1 ring-brand-line focus:ring-2 focus:ring-brand"
        />
        <p className="min-h-6 text-red-600" role="alert">{error}</p>
        <button
          disabled={pending || !password}
          className="min-h-12 rounded-lg bg-brand text-lg font-bold text-white disabled:opacity-50"
        >
          {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}
