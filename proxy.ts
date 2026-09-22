import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Case A: a redirect issued from proxy/middleware.
  if (pathname === '/redirect-source') {
    return NextResponse.redirect(new URL('/target', request.url), { status: 307 });
  }

  // Case B: the same thing as a rewrite, for comparison.
  if (pathname === '/rewrite-source') {
    return NextResponse.rewrite(new URL('/target', request.url));
  }

  // Typical CDN-fronted setup: every HTML/RSC response is publicly cacheable.
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'public, max-age=60');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
