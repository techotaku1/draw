import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { getI18nPath } from '@/utils/Helpers';

type SignUpPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: SignUpPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'SignUp',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

/**
 * Renders the Clerk form once the locale resolves.
 *
 * Nothing links here. The route exists because an OAuth sign-in with a Google
 * account that has no Clerk user yet is transferred into a sign-up, and that
 * transfer needs a destination — without it the flow hangs after the Google
 * consent screen. Who may actually register is a Clerk Dashboard setting, not
 * a question of whether this file exists.
 *
 * @param props Route props carrying the locale.
 * @returns The sign-up widget.
 */
async function SignUpForm(props: SignUpPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return <SignUp path={getI18nPath('/sign-up', locale)} />;
}

export default function SignUpPage(props: SignUpPageProps) {
  return (
    // A bare Suspense renders nothing while it waits, which reads as a
    // broken page on a slow connection. The skeleton holds the card's shape.
    <Suspense fallback={<div className="h-96 w-80 animate-pulse rounded-lg bg-gray-200" />}>
      <SignUpForm params={props.params} />
    </Suspense>
  );
}
