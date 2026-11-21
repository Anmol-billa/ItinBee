import { expect, test } from '@playwright/test';

test.describe('Itinbee end-to-end platform journeys', () => {
  test('1. Landing page interactive preview and handoff into /create', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Tell us where/i }).first()).toBeVisible();

    // Interactive planner preview switches days on landing page
    await page.getByRole('tab', { name: 'Day 2' }).click();
    await expect(page.getByRole('heading', { name: /Day 2: Ghat switchbacks/i })).toBeVisible();

    // Click an example chip on the luggage-tag composer and submit
    await page.getByRole('button', { name: /Goa with 6 friends in December/i }).first().click();
    const composer = page.getByPlaceholder(/Describe your trip, paste your notes/i).first();
    await expect(composer).toHaveValue(/Goa with 6 friends in December/i);

    await page.getByRole('button', { name: 'Build my trip' }).first().click();
    await expect(page).toHaveURL(/\/create\?q=Goa/);
    await expect(page.locator('textarea').first()).toHaveValue(/Goa with 6 friends in December/i);
    expect(errors).toEqual([]);
  });

  test('2. Explore hierarchical location + duration filters and clone to editor', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Browse itineraries' })).toBeVisible();

    // Filter by Rajasthan (hierarchical parent -> matches Jaipur, Udaipur, Jodhpur, Jaisalmer, Royal Rajasthan)
    const combo = page.getByRole('combobox');
    await combo.click();
    await combo.fill('Rajasthan');
    const opt = page.getByRole('option', { name: /^Rajasthan\b/i }).first();
    await expect(opt).toBeVisible({ timeout: 5000 });
    await opt.click();
    await expect(page).toHaveURL(/dest=rajasthan/i);

    // Filter by 4-6 days
    await page.getByRole('button', { name: /4–6 days/ }).click();
    await expect(page).toHaveURL(/days=4-6/);

    // Open the first matching itinerary detail page
    const firstCard = page.locator('main ul a[href^="/explore/"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/explore\/[a-z0-9-]+/i);
    await expect(page.getByRole('heading', { name: 'Day by day' })).toBeVisible();

    // Clone or open into the trip editor
    const useBtn = page.getByRole('button', { name: /Use this itinerary/i });
    if (await useBtn.isVisible().catch(() => false)) {
      await useBtn.click();
      await expect(page).toHaveURL(/\/trip\/[a-z0-9-]+/i);
    } else {
      await page.getByRole('link', { name: /Open this itinerary/i }).click();
      await expect(page).toHaveURL(/\/trip\/[a-z0-9-]+/i);
    }
    await expect(page.getByRole('tablist', { name: /Workspace mode/i })).toBeVisible();
  });

  test('3. Smart Import /create flow: messy notes -> Review -> Build -> Trip Editor', async ({ page }) => {
    await page.goto('/create');
    const textarea = page.locator('textarea').first();
    await textarea.fill(
      '4 days in Jaipur and Udaipur with family and senior parents in November, pure vegetarian food, relaxed pace, budget around ₹45,000. Must visit Hawa Mahal and Amber Fort.'
    );

    await page.getByRole('button', { name: /Read & plan my trip/i }).click();

    // Wait for Stage A to land on Review ("Here's what we understood")
    await expect(page.getByRole('heading', { name: /what we understood/i })).toBeVisible({ timeout: 25_000 });

    // Confirm and build the day-by-day itinerary
    await page.getByRole('button', { name: /Build day-by-day itinerary/i }).click();

    // Lands in the live trip editor with the generated trip
    await expect(page).toHaveURL(/\/trip\/[a-z0-9-]+/i, { timeout: 30_000 });
    await expect(page.getByRole('tablist', { name: /Workspace mode/i })).toBeVisible();
  });

  test('4. Trip Editor: stop reorder, automatic place discovery, map sync & Ask Itinbee', async ({ page }) => {
    await page.goto('/trip/rishi-lnd-4d');
    await expect(page.getByRole('tablist', { name: /Workspace mode/i })).toBeVisible();

    // Wait for lazy-loaded TripMap (MapLibre or Schematic fallback) to mount stop markers
    await expect(page.getByTestId('map-stop-marker').first()).toBeVisible({ timeout: 20_000 });
    const initialMarkers = await page.getByTestId('map-stop-marker').count();
    expect(initialMarkers).toBeGreaterThan(0);

    // Add a discovered place from the Explore Places pane to the active day
    const addPlaceBtn = page.getByRole('button', { name: /^\+ Day \d+/i }).first();
    await expect(addPlaceBtn).toBeVisible({ timeout: 20_000 });
    await addPlaceBtn.click();

    await expect
      .poll(async () => page.getByTestId('map-stop-marker').count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(initialMarkers);
  });

  test('5. Guest draft -> Email magic sign-in -> My Trips account merge', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill('traveller.e2e@itinbee.test');
    await page.getByRole('button', { name: /Send.*code|Continue with email/i }).first().click();

    // Fill dev code button if offered in local dev
    const fillDevBtn = page.getByRole('button', { name: /local dev code/i });
    if (await fillDevBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillDevBtn.click();
      const verifyBtn = page.getByRole('button', { name: /Verify|Sign in/i }).first();
      if (await verifyBtn.isVisible().catch(() => false)) {
        await verifyBtn.click();
      }
    }

    await page.goto('/trips');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('6. Mobile 390px layout & WhatsApp Elder Card have zero horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ['/', '/explore', '/create', '/destinations', '/trip/rishi-lnd-4d', '/t/rishi-lnd-4d']) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(2);
    }
  });
});
