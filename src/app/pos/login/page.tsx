import { LoginForm } from "./LoginForm";

export default function PosLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">เข้าสู่ระบบร้าน</h1>
        <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">เฟสถัดไป</span>
      </div>
      <LoginForm />
    </main>
  );
}
