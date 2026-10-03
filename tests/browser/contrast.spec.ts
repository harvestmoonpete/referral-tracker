import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function checkContrast(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(result.violations.map(v => ({ rule: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('coordinator and patient states retain readable contrast', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /New referral/ })).toBeVisible();
  await checkContrast(page);
  const cards = page.locator('.referral-card');
  for (let i = 0; i < await cards.count(); i++) {
    await cards.nth(i).click();
    await checkContrast(page);
  }
  await page.getByRole('combobox', { name: 'Explore a perspective' }).selectOption('alex');
  await expect(page.getByRole('heading', { name: 'Your referrals' })).toBeVisible();
  await checkContrast(page);
});
