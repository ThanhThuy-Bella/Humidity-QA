import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Làm mới phiên Supabase + chặn trang khi chưa đăng nhập (giữ ?next= để QR mở đúng lô sau khi đăng nhập).
 * v1.4.1: chạy Node.js runtime (không dùng Edge), bỏ qua /api, lỗi bất kỳ → cho đi tiếp (fail-open):
 * các layout (app) và /m vẫn tự kiểm tra đăng nhập phía server bằng requireUser().
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error("[middleware] Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return res;
    }
    const sb = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await sb.auth.getUser();
    const path = req.nextUrl.pathname;
    if (!data.user && !path.startsWith("/login")) {
      const to = req.nextUrl.clone();
      to.pathname = "/login";
      to.search = "";
      to.searchParams.set("next", path + req.nextUrl.search);
      return NextResponse.redirect(to);
    }
    return res;
  } catch (e) {
    console.error("[middleware] lỗi:", e instanceof Error ? e.stack ?? e.message : e);
    return res;
  }
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
