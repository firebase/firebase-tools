// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL('/about-2', request.url));
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/about/:path*',
}
