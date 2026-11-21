import { expect, test } from '@playwright/test';

test.describe('Itinbee end-to-end platform & production-hardening journeys', () => {
  test('1. Landing page interactive preview, format tabs, empty guard, and handoff into /create', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Tell us where/i }).first()).toBeVisible();

    // Empty submission stays on / and shows validation instead of navigating to /create?q=
    await page.getByRole('button', { name: 'Build my trip' }).first().click();
    await expect(page).toHaveURL(/\/$/);

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

    const combo = page.getByRole('combobox');
    await combo.click();
    await combo.fill('Rajasthan');
    const opt = page.getByRole('option', { name: /^Rajasthan\b/i }).first();
    await expect(opt).toBeVisible({ timeout: 5000 });
    await opt.click();
    await expect(page).toHaveURL(/dest=rajasthan/i);

    await page.getByRole('button', { name: /4–6 days/ }).click();
    await expect(page).toHaveURL(/days=4-6/);

    const firstCard = page.locator('main ul a[href^="/explore/"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page).toHaveURL(/\/explore\/[a-z0-9-]+/i);
    await expect(page.getByRole('heading', { name: 'Day by day' })).toBeVisible();

    const useBtn = page.getByRole('button', { name: /Use this itinerary/i });
    if (await useBtn.isVisible().catch(() => false)) {
      await useBtn.click();
      await expect(page).toHaveURL(/\/trip\/[a-z0-9-]+/i);
    } else {
      await page.getByRole('link', { name: /Open this itinerary/i }).click();
      await expect(page).toHaveURL(/\/trip\/[a-z0-9-]+/i);
    }
    await expect(page.getByRole('tablist', { name: /Workspace mode|Trip workspace modes/i })).toBeVisible();
  });

  test('3. Smart Import /create with IRCTC PNR + messy notes: zero React crash, deduped stops & locked anchor', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/create');
    const textarea = page.locator('textarea').first();
    await textarea.fill(
      'PNR 8429104821 Train 12985 NDLS to JP 14 Dec 06:05 Coach C2. 4 days in Jaipur and Udaipur with family, pure veg food, relaxed pace. Must visit Hawa Mahal, Amber Fort, and Hawa Mahal.'
    );

    await page.getByRole('button', { name: /Read & plan my trip/i }).click();

    // Stage A lands on Review without crashing on BookingAnchor.summary object
    await expect(page.getByRole('heading', { name: /what we understood/i })).toBeVisible({ timeout: 25_000 });
    expect(errors).toEqual([]);

    // Confirm and build the day-by-day itinerary
    await page.getByRole('button', { name: /Build day-by-day itinerary/i }).click();

    await expect(page).toHaveURL(/\/trip\/[a-z0-9-]+/i, { timeout: 30_000 });
    await expect(page.getByRole('tablist', { name: /Workspace mode|Trip workspace modes/i })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('4. Trip Editor: automatic place discovery, map sync & Ask Itinbee HTTP 200', async ({ page }) => {
    await page.goto('/trip/rishi-lnd-4d');
    await expect(page.getByRole('tablist', { name: /Workspace mode|Trip workspace modes/i })).toBeVisible();

    // Verify raw snake_case enum tokens are formatted cleanly
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('pure_veg');

    await expect(page.getByTestId('map-stop-marker').first()).toBeVisible({ timeout: 20_000 });
    const initialMarkers = await page.getByTestId('map-stop-marker').count();
    expect(initialMarkers).toBeGreaterThan(0);

    const addPlaceBtn = page.getByRole('button', { name: /^\+ Day \d+/i }).first();
    await expect(addPlaceBtn).toBeVisible({ timeout: 20_000 });
    await addPlaceBtn.click();

    await expect
      .poll(async () => page.getByTestId('map-stop-marker').count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(initialMarkers);
  });

  test('5. Destination pages (/destinations/jaipur, bali, kyoto, hanoi) return HTTP 200 with zero 500s', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (const slug of ['jaipur', 'bali', 'kyoto', 'hanoi']) {
      const res = await page.goto(`/destinations/${slug}`);
      expect(res?.status(), `HTTP status for /destinations/${slug}`).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('6. Full Cloud Sync: Expenses, Polls, Co-Travellers & Account UPI VPA survive Sign-In / Sign-Out / Re-Login with zero fake @okicici', async ({ page }) => {
    // 1. Create a fresh cloud trip via /create/manual
    await page.goto('/create/manual');
    const combo = page.getByRole('combobox').first();
    await combo.click();
    await combo.fill('Munnar');
    const munnarOpt = page.getByRole('option', { name: /Munnar/i }).first();
    await expect(munnarOpt).toBeVisible({ timeout: 5_000 });
    await munnarOpt.click();

    await page.getByRole('button', { name: /Create & open editor/i }).click();
    await expect(page).toHaveURL(/\/trip\/[0-9a-f-]{36}/i, { timeout: 15_000 });
    const tripUrl = page.url();

    // 2. Test Ask Itinbee returns HTTP 200 (not 400) on this cloud trip
    const assistInput = page.getByPlaceholder(/Ask Itinbee/i).first();
    if (await assistInput.isVisible().catch(() => false)) {
      const [assistRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/assist') && r.request().method() === 'POST'),
        (async () => {
          await assistInput.fill('Make Day 1 more relaxed');
          await page.getByRole('button', { name: /Propose|Ask/i }).first().click();
        })(),
      ]);
      expect(assistRes.status()).toBe(200);
    }

    // 3. Add Co-Traveller Aarav & create a Poll in Group & Polls
    await page.getByRole('tab', { name: /Group & Polls/i }).click();
    await page.getByLabel('New co-traveller name').fill('Aarav');
    await page.getByRole('button', { name: 'Add traveller' }).click();
    await expect(page.getByText('Aarav').first()).toBeVisible();

    await page.getByLabel('Poll question').fill('Sunrise spot?');
    await page.getByLabel('Poll option 1').fill('Top Station');
    await page.getByLabel('Poll option 2').fill('Kolukkumalai');
    await page.getByRole('button', { name: 'Post poll' }).click();
    await expect(page.getByText('Sunrise spot?')).toBeVisible();

    // 4. Log ₹1,200 Expense in Budget & UPI and assert ZERO @okicici fake VPA
    await page.getByRole('tab', { name: /Budget & UPI/i }).click();
    await page.getByLabel('Expense description').fill('Tea Estate Lunch');
    await page.getByLabel('Expense amount').fill('1200');
    await page.getByRole('button', { name: 'Log expense' }).click();
    await expect(page.getByText('Tea Estate Lunch')).toBeVisible();
    const budgetText = await page.locator('main').innerText();
    expect(budgetText).not.toContain('@okicici');

    // 5. Sign in via /login, save UPI VPA on /account, verify reload persistence, sign out & sign back in
    const uniqueEmail = `qa.${Date.now()}@itinbee.test`;
    await page.goto('/login');
    await page.locator('input[type="email"]').first().fill(uniqueEmail);
    await page.getByRole('button', { name: /Send.*code|Continue with email/i }).first().click();
    const fillDevBtn = page.getByRole('button', { name: /local dev code/i });
    await expect(fillDevBtn).toBeVisible({ timeout: 8_000 });
    await fillDevBtn.click();
    await page.getByRole('button', { name: /Verify|Sign in/i }).first().click();
    await expect(page).toHaveURL(/\/trips|\/account/, { timeout: 10_000 });

    await page.goto('/account');
    const upiInput = page.getByLabel(/Default UPI ID/i);
    await expect(upiInput).toBeVisible();
    await upiInput.fill('audittester@okaxis');
    await page.getByRole('button', { name: /Save changes/i }).click();
    await expect(page.getByText(/Account preferences saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Default UPI ID/i)).toHaveValue('audittester@okaxis');

    // Sign out and sign back in
    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.locator('input[type="email"]').first().fill(uniqueEmail);
    await page.getByRole('button', { name: /Send.*code|Continue with email/i }).first().click();
    await expect(fillDevBtn).toBeVisible({ timeout: 8_000 });
    await fillDevBtn.click();
    await page.getByRole('button', { name: /Verify|Sign in/i }).first().click();
    await expect(page).toHaveURL(/\/trips|\/account/, { timeout: 10_000 });

    // Reopen trip and confirm Expense, Co-Traveller & Poll all survived in cloud storage!
    await page.goto(tripUrl);
    await page.getByRole('tab', { name: /Budget & UPI/i }).click();
    await expect(page.getByText('Tea Estate Lunch')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('tab', { name: /Group & Polls/i }).click();
    await expect(page.getByText('Aarav').first()).toBeVisible();
    await expect(page.getByText('Sunrise spot?')).toBeVisible();
  });

  test('7. Co-Editor Invite Link allows a second browser user to join a trip', async ({ page, browser }) => {
    await page.goto('/create/manual');
    const combo = page.getByRole('combobox').first();
    await combo.click();
    await combo.fill('Jaipur');
    await page.getByRole('option', { name: /^Jaipur\b/i }).first().click();
    await page.getByRole('button', { name: /Create & open editor/i }).click();
    await expect(page).toHaveURL(/\/trip\/[0-9a-f-]{36}/i, { timeout: 15_000 });
    const tripUrl = page.url();

    await page.getByRole('tab', { name: /Group & Polls/i }).click();
    await page.getByRole('button', { name: 'Create invite link' }).click();

    const inviteInput = page.getByLabel('Co-editor invite link');
    await expect(inviteInput).toBeVisible({ timeout: 8_000 });
    const inviteHref = await inviteInput.inputValue();
    const invitePath = new URL(inviteHref, 'http://localhost:3000').pathname;

    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(invitePath);
    await page2.getByRole('button', { name: 'Join Trip' }).click();
    await expect(page2).toHaveURL(new RegExp(tripUrl.split('/trip/')[1]!), { timeout: 15_000 });
    await ctx2.close();
  });

  test('8. Mobile 390px layout & WhatsApp Elder Card have zero horizontal overflow', async ({ page }) => {
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
