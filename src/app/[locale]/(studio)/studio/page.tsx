import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StudioShell } from '@/features/landmarks/StudioShell';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'Studio' });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function StudioPage(props: PageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return <StudioShell initialMode="body" />;
}

// The session guard in the layout redirects during prefetch, so this route
// can never show a prerendered shell. Sibling navigations are validated even
// when the layout opts out, which is why the page declares it too.
export const instant = false;
