const { test, expect } = require('@playwright/test');

// These tests use the live CloudFront stream, so they need network access.
// They are kept out of `npm test`; run them with `npm run test:e2e`.

test.describe('player UI', () => {
  test('shows the page, the brand and the play button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand')).toContainText('Radio');
    await expect(page.locator('.brand')).toContainText('Calico');
    await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Play');
    await expect(page.locator('h1#artist')).toBeVisible();
  });

  test('loads the stylesheet and script without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await expect(page.locator('.site-header')).toHaveCSS('background-color', 'rgb(56, 162, 157)');
    await expect(page.locator('#status')).not.toHaveText('Connecting to stream…', { timeout: 20000 });
    expect(errors.filter((e) => !/Failed to load resource.*(fonts|googleapis)/.test(e))).toEqual([]);
  });

  test('shows current track metadata from the live feed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#title')).not.toHaveText('Tuning in…', { timeout: 20000 });
    await expect(page.locator('#artist')).not.toHaveText('');
    await expect(page.locator('#sourceQuality')).not.toHaveText('—', { timeout: 20000 });
  });

  test('mute button toggles the mute state', async ({ page }) => {
    await page.goto('/');
    const mute = page.locator('#muteBtn');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-label', 'Unmute');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-label', 'Mute');
  });
});

test.describe('real playback', () => {
  test('play starts audio and the page reports it is playing live', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#playBtn')).toBeEnabled({ timeout: 30000 });

    await page.locator('#playBtn').click();

    await expect(page.locator('#status')).toHaveText('Playing live', { timeout: 30000 });
    await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Pause');

    // The audio element must actually be advancing, not just reporting "playing".
    const advanced = await page.evaluate(async () => {
      const audio = document.getElementById('audio');
      const start = audio.currentTime;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return audio.currentTime - start;
    });
    expect(advanced).toBeGreaterThan(1);
  });

  test('pause stops playback', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#playBtn')).toBeEnabled({ timeout: 30000 });
    await page.locator('#playBtn').click();
    await expect(page.locator('#status')).toHaveText('Playing live', { timeout: 30000 });

    await page.locator('#playBtn').click();
    await expect(page.locator('#status')).toHaveText('Paused');
    await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Play');
  });

  test('stream quality label reflects the level actually playing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#playBtn')).toBeEnabled({ timeout: 30000 });
    await page.locator('#playBtn').click();
    await expect(page.locator('#status')).toHaveText('Playing live', { timeout: 30000 });

    // The label must be one of the two real renditions, never a stale default.
    await expect(page.locator('#streamQuality')).toHaveText(
      /^(48kHz FLAC \/ HLS Lossless|AAC \/ HLS)$/,
      { timeout: 30000 },
    );
  });
});
