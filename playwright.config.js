// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
  },
  projects: [
    { name: 'mobile' },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } },
  ],
});
