import { ClerkProvider } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { clerkLocalization } from '@/utils/AppConfig';

export default async function StudioLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  // The studio is the product, so it sits behind the session. Protection is on
  // the resource rather than in the middleware: `createRouteMatcher` is
  // deprecated and Clerk now asks each route to guard itself.
  //
  // `auth()` rather than `auth.protect()` because only the former takes
  // `treatPendingAsSignedOut`. That flag defaults to true, which bounced every
  // freshly signed-up user: an OAuth sign-up leaves the session `pending` for a
  // moment, the guard read that as signed out and sent them to /sign-in, which
  // saw a session and sent them back — a loop that only ended once the session
  // settled. A pending session has already proved who the user is.
  const { isAuthenticated, redirectToSignIn } = await auth({ treatPendingAsSignedOut: false });

  if (!isAuthenticated) {
    redirectToSignIn();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'SignIn' });
  const clerkLocale = clerkLocalization(locale, t('clerk_subtitle'));

  // No chrome of its own: the studio fills the viewport and carries its own
  // command bar, so a second navigation row would only repeat its controls.
  return (
    <ClerkProvider
      appearance={{
        cssLayerName: 'clerk', // Ensure Clerk is compatible with Tailwind CSS v4
      }}
      localization={clerkLocale}
      signInUrl="/sign-in"
      // OAuth needs somewhere to land when the Google account has no Clerk user
      // yet: Clerk transfers the sign-in into a sign-up. Without this the flow
      // hangs after the Google consent screen. The route is unlinked, not public.
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/studio"
      signUpFallbackRedirectUrl="/studio"
      afterSignOutUrl="/"
    >
      {props.children}
    </ClerkProvider>
  );
}

// Reading the session is request work, so the shell cannot be prerendered.
// That is the cost of putting the tool behind a login, not a missing boundary.
export const instant = false;
