import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { getI18nPath } from '@/utils/Helpers';

type SignInPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: SignInPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'SignIn',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

/**
 * Renders the Clerk form once the locale resolves.
 *
 * The widget needs its own path to keep the locale prefix, and that path comes
 * from `params` — request data. Reading it here rather than in the page keeps
 * the surrounding shell prerenderable.
 *
 * @param props Route props carrying the locale.
 * @returns The sign-in widget.
 */
async function SignInForm(props: SignInPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  // The footer links to sign-up. That route exists only so Clerk can transfer
  // an OAuth sign-in into a sign-up when the Google account has no user yet;
  // it is not an entry point we advertise, so the link stays hidden.
  return (
    <SignIn
      path={getI18nPath('/sign-in', locale)}
      appearance={{ elements: { footerAction: 'hidden' } }}
    />
  );
}

export default function SignInPage(props: SignInPageProps) {
  return (
    // A bare Suspense renders nothing while it waits, which reads as a
    // broken page on a slow connection. The skeleton holds the card's shape.
    <Suspense fallback={<div className="h-96 w-80 animate-pulse rounded-lg bg-gray-200" />}>
      <SignInForm params={props.params} />
    </Suspense>
  );
}
