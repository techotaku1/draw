import { expect, takeSnapshot, test } from '@chromatic-com/playwright';

test.describe('Visual testing', () => {
  test.describe('Static pages', () => {
    test('should take screenshot of the homepage', async ({ page }, testInfo) => {
      await page.goto('/');

      await expect(
        page.getByRole('heading', { name: 'Antes de dibujar, entendé la estructura' }),
      ).toBeVisible();

      await takeSnapshot(page, testInfo);
    });

    test('should take screenshot of the studio page', async ({ page }, testInfo) => {
      await page.goto('/studio');

      await expect(page.getByRole('heading', { name: 'Estudio de encaje' })).toBeVisible();

      await takeSnapshot(page, testInfo);
    });

    test('should take screenshot of the portfolio page', async ({ page }, testInfo) => {
      await page.goto('/portfolio');

      await expect(page.getByText('Bienvenido a mi portfolio.')).toBeVisible();

      await takeSnapshot(page, testInfo);
    });

    test('should take screenshot of the about page', async ({ page }, testInfo) => {
      await page.goto('/about');

      await expect(page.getByText('DrawSkeleton nace de una idea simple')).toBeVisible();

      await takeSnapshot(page, testInfo);
    });

    test('should take screenshot of the portfolio details page', async ({ page }, testInfo) => {
      await page.goto('/portfolio/2');

      await expect(page.getByText('Creación de un conjunto de materiales')).toBeVisible();

      await takeSnapshot(page, testInfo);
    });

    test('should take screenshot of the English homepage', async ({ page }, testInfo) => {
      await page.goto('/en');

      await expect(
        page.getByRole('heading', { name: 'Understand the structure before you draw' }),
      ).toBeVisible();

      await takeSnapshot(page, testInfo);
    });
  });
});
