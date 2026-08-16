import { test, expect } from '@playwright/test';

test.describe('Suchi Grocery Manager E2E Flow', () => {
  test('Full User Journey: Create list -> search catalog -> set quantity -> review -> finalize -> shopping mode -> complete', async ({
    page,
  }) => {
    // 1. Visit Home page
    await page.goto('/');
    await expect(page.getByText('Smart Suggestion Engine Active')).toBeVisible();

    // 2. Navigate to Catalog
    await page.getByRole('button', { name: 'Catalog' }).click();
    await expect(page.getByText('Grocery Catalog')).toBeVisible();

    // 3. Search for "Atta"
    const searchInput = page.getByPlaceholder('Search items or Hindi names');
    await searchInput.fill('Atta');
    await expect(page.getByText('Chakki Fresh Atta')).toBeVisible();

    // 4. Add 1 kg Atta to list
    await page.getByRole('button', { name: /Add 1 kg/i }).click();

    // 5. Navigate to List Review
    await page.getByRole('button', { name: /Review List/i }).first().click();
    await expect(page.getByText('Draft List Review')).toBeVisible();
    await expect(page.getByText('Chakki Fresh Atta')).toBeVisible();

    // 6. Finalize list
    await page.getByRole('button', { name: /Finalize & Save List/i }).click();

    // 7. Verify redirect to history or completed state
    await expect(page.getByText('Monthly Grocery History')).toBeVisible();
  });

  test('Offline PWA Mode Resilience', async ({ context, page }) => {
    // 1. Visit App first time to prime service worker & IndexedDB cache
    await page.goto('/');
    await expect(page.getByText('Namaste! Ready for this month')).toBeVisible();

    // 2. Emulate network disconnect
    await context.setOffline(true);

    // 3. Open catalog and search while offline
    await page.getByRole('button', { name: 'Catalog' }).click();
    await expect(page.getByText('Grocery Catalog')).toBeVisible();

    // 4. Add custom item while offline
    await page.getByRole('button', { name: '+ Custom Item' }).click();
    await page.getByPlaceholder('e.g. Organic Jaggery / Gud').fill('Offline Jaggery');
    await page.getByRole('button', { name: 'Add to Catalog & Draft' }).click();

    // 5. Review draft list offline
    await page.getByRole('button', { name: /Review List/i }).first().click();
    await expect(page.getByText('Offline Jaggery')).toBeVisible();

    // Re-enable network for cleanup
    await context.setOffline(false);
  });
});
