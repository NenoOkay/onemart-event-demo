import { BrandLogo } from "@/components/BrandLogo";
import { LoginForm } from "./LoginForm";

export default function PosLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <BrandLogo className="mx-auto h-20" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">เข้าสู่ระบบร้าน</h1>
        <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">เฟสถัดไป</span>
      </div>
      <LoginForm />
    </main>
  );
}
