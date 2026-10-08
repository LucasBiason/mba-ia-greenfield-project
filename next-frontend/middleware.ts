import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { unsealData } from 'iron-session';

const SESSION_PWD = process.env.SESSION_PASSWORD;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /studio and its subroutes
  if (pathname.startsWith('/studio')) {
    const sessionCookie = request.cookies.get('streamtube_session');
    if (!sessionCookie || !sessionCookie.value) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!SESSION_PWD) {
      throw new Error(
        'SESSION_PASSWORD environment variable is required (must be at least 32 characters)',
      );
    }

    try {
      const sessionData = await unsealData<{
        isLoggedIn?: boolean;
        accessToken?: string;
      }>(sessionCookie.value, { password: SESSION_PWD });

      if (!sessionData?.isLoggedIn || !sessionData?.accessToken) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete('streamtube_session');
        return response;
      }
    } catch {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('streamtube_session');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/studio/:path*'],
};
