import { ClerkProvider } from '@clerk/nextjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { clerkLocalization } from '@/utils/AppConfig';

export default async function AuthLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'SignIn' });
  const clerkLocale = clerkLocalization(locale, t('clerk_subtitle'));

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
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      {props.children}
    </ClerkProvider>
  );
}

// Temporary opt-out: every route in this group reads Clerk auth outside a
// Suspense boundary. These are boilerplate demo pages; migrating them is its
// own change. The studio has its own layout and stays instant.
export const instant = false;
