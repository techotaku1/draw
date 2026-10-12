import type { MetadataRoute } from 'next';
import { routing } from '@/libs/I18nRouting';
import { getBaseUrl, getI18nPath } from '@/utils/Helpers';

// Stamped once at module load. Reading the clock per entry is an unstable value
// during prerender, which would turn the whole sitemap into a dynamic route for
// a timestamp that is only ever as fresh as the deployment anyway.
const LAST_MODIFIED = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();

  const routes = ['', '/about', '/counter', '/portfolio'];

  // Generate portfolio detail pages
  const portfolioRoutes = Array.from({ length: 6 }, (_, i) => `/portfolio/${i}`);
  const allRoutes = [...routes, ...portfolioRoutes];

  return allRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: LAST_MODIFIED,
    alternates: {
      languages: Object.fromEntries(
        routing.locales
          .filter((locale) => locale !== routing.defaultLocale)
          .map((locale) => [locale, `${baseUrl}${getI18nPath(route, locale)}`]),
      ),
    },
  }));
}
