import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE } from '@/lib/devices';

// Refreshes the Supabase auth session cookie on every request so server
// components always see a valid (or correctly expired) session.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Name this browser, once.
  //
  // A cookie rather than localStorage, because what has to read it is a
  // server component deciding whether to let this browser into HQ — and a
  // server component cannot see localStorage. Middleware is one of the few
  // places allowed to set a cookie on the way past; a layout is not.
  //
  // It is not a fingerprint and is not treated as one: it names a browser
  // profile, not a person or a machine. Clearing site data legitimately
  // produces a new one, which is why an unrecognised device is a request to
  // the owner rather than a refusal.
  //
  // Decided here and written at the very end on purpose. Refreshing the
  // Supabase session below REPLACES `response` with a fresh one, so a cookie
  // set on the old object is silently dropped — and only on the requests
  // where the token happened to need refreshing, which is the kind of bug
  // that looks like "it works, mostly".
  const existingDevice = request.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = existingDevice ?? crypto.randomUUID();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Even with no database configured the cookie is worth setting, so the
    // browser keeps one identity from its very first visit rather than being
    // renamed the moment the project is wired up.
    if (!existingDevice) {
      response.cookies.set(DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Touches the session so an expired access token gets refreshed via the
  // cookie's refresh token before any server component runs.
  await supabase.auth.getUser();

  if (!existingDevice) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
