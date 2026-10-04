import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4317/gnomon/',
    timezoneId: 'UTC',
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4317 --strictPort',
    url: 'http://127.0.0.1:4317/gnomon/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'firefox', use: { browserName: 'firefox' } }],
});
