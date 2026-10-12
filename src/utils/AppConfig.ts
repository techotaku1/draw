import { enUS, esES } from '@clerk/localizations';
import type { LocalizationResource } from '@clerk/shared/types';
import type { LocalePrefixMode } from 'next-intl/routing';

/** Locale prefix strategy for next-intl routing. */
const localePrefix: LocalePrefixMode = 'as-needed';

/** Centralized application configuration */
export const AppConfig = {
  name: 'DrawSkeleton',
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    localePrefix,
  },
};

const supportedLocales: Record<string, LocalizationResource> = {
  es: esES,
  en: enUS,
};

const defaultClerkLocale = esES;

/**
 * Clerk's prebuilt screens greet the user with the application name set in the
 * Clerk Dashboard, which is the instance-wide default. Overriding the subtitle
 * here lets the product name live with the rest of the UI copy, in
 * `src/locales`, instead of in a setting no one reading this repo can see.
 *
 * @param locale Active locale.
 * @param subtitle Already-translated line shown under the sign-in heading.
 * @returns The locale bundle Clerk expects, with that line replaced.
 */
export const clerkLocalization = (locale: string, subtitle: string): LocalizationResource => {
  const base = supportedLocales[locale] ?? defaultClerkLocale;

  return {
    ...base,
    signIn: {
      ...base.signIn,
      start: { ...base.signIn?.start, subtitle },
    },
  };
};
