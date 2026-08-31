import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Refreshes the Supabase auth session cookie on every request so server
// components always see a valid (or correctly expired) session.
export async function proxy(request: NextRequest) {
  // The path, forwarded to the server components as a header.
  //
  // A root layout can't otherwise know which route it is wrapping, and it has
  // to: HQ has its own sidebar shell and must not also carry the shop's
  // header, footer, cart button and chat widget. The alternative — two root
  // layouts in separate route groups — would mean moving every shop page on
  // disk to express one boolean.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Touches the session so an expired access token gets refreshed via the
  // cookie's refresh token before any server component runs.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
