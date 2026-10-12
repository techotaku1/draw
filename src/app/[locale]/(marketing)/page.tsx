import { redirect } from '@/libs/I18nNavigation';

type IndexPageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The root is the studio. DrawSkeleton is a tool, not a site with a tool
 * behind it, so landing anywhere else is a step the user did not ask for.
 *
 * @param props Route props carrying the locale.
 */
export default async function IndexPage(props: IndexPageProps) {
  const { locale } = await props.params;

  redirect({ href: '/studio', locale });
}

// A page whose whole body is a redirect has no shell to validate: the
// validator only ever sees the NEXT_REDIRECT it throws by design.
export const instant = false;
