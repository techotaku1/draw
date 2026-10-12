import { expect, test } from '@playwright/test';

test.describe('I18n', () => {
  test.describe('Language Switching', () => {
    test('should switch language from Spanish to English using dropdown and verify text on the homepage', async ({
      page,
    }) => {
      await page.goto('/');

      await expect(
        page.getByRole('heading', { name: 'Antes de dibujar, entendé la estructura' }),
      ).toBeVisible();

      await page.getByLabel('Cambiar idioma').selectOption('en');

      await expect(
        page.getByRole('heading', { name: 'Understand the structure before you draw' }),
      ).toBeVisible();
    });

    test('should switch language from Spanish to English using URL and verify text on the studio page', async ({
      page,
    }) => {
      await page.goto('/studio');

      await expect(page.getByRole('heading', { name: 'Estudio de encaje' })).toBeVisible();

      await page.goto('/en/studio');

      await expect(page.getByRole('heading', { name: 'Structure studio' })).toBeVisible();
    });
  });
});
