const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3333;

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Chromium needs autoplay allowed for the play button to start audio in a test.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
