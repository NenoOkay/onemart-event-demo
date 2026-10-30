import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// หน้า POS ต้อง login ก่อน (ยกเว้นหน้า P1 เอง) · สิทธิ์จริงบังคับด้วย RLS ในฐานข้อมูล
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/pos") && pathname !== "/pos/login" && !claims) {
    return NextResponse.redirect(new URL("/pos/login", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/pos/:path*"],
};
