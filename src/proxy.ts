import { detectBot } from '@arcjet/next';
import { clerkMiddleware } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import arcjet from '@/libs/Arcjet';
import { routing } from './libs/I18nRouting';

const handleI18nRouting = createMiddleware(routing);

// Improve security with Arcjet
const aj = arcjet.withRule(
  detectBot({
    mode: 'LIVE',
    // Block all bots except the following
    allow: [
      // See https://docs.arcjet.com/bot-protection/identifying-bots
      'CATEGORY:SEARCH_ENGINE', // Allow search engines
      'CATEGORY:PREVIEW', // Allow preview links to show OG images
      'CATEGORY:MONITOR', // Allow uptime monitoring services
    ],
  }),
);

// Clerk wraps the whole request and next-intl decides the locale inside it,
// which is the composition Clerk documents. Route protection is NOT done here:
// `createRouteMatcher` is deprecated, and Clerk now asks each page, route
// handler and server action to protect itself. See `(auth)/layout.tsx` and
// `(studio)/layout.tsx`.
const withClerk = clerkMiddleware((_auth, req) => handleI18nRouting(req));

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Verify the request with Arcjet
  // Use `process.env` instead of Env to reduce bundle size in middleware
  if (process.env.ARCJET_KEY) {
    const decision = await aj.protect(request);

    if (decision.isDenied()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return await withClerk(request, event);
}

export const config = {
  matcher: [
    // Everything except Next.js internals, Vercel internals, Sentry's tunnel
    // and files with an extension.
    '/((?!_next|_vercel|monitoring|api|.*\\..*).*)',
    // Clerk's own frontend API routes have to reach the middleware.
    '/__clerk/(.*)',
  ],
};
