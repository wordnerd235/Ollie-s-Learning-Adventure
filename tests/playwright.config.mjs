import { defineConfig } from '@playwright/test';
import { IPHONE_UA, PORT } from './helpers.mjs';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  globalSetup: './global-setup.mjs',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    userAgent: IPHONE_UA,          // exercise the iPhone code paths
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
});
