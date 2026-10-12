import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StudioShell } from '@/features/landmarks/StudioShell';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'FaceStudio' });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function FacePage(props: PageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return <StudioShell initialMode="face" />;
}

// Same as its sibling: behind the login, so no prerendered shell exists.
export const instant = false;
