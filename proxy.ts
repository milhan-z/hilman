import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protects /admin/*: refreshes the Supabase session cookie and redirects
 * unauthenticated visitors to /admin/login. RLS is the real enforcement —
 * this is just the front door.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });
  if (!url || !anonKey) return response; // not configured → admin pages show setup notice

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/admin/login");

  // Redirects must carry refreshed cookies too; otherwise the browser keeps
  // using an expired session after the proxy has successfully refreshed it.
  const redirectWithCookies = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && !isLogin) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    return redirectWithCookies(loginUrl);
  }
  if (user && isLogin) {
    const adminUrl = request.nextUrl.clone();
    adminUrl.pathname = "/admin";
    return redirectWithCookies(adminUrl);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
