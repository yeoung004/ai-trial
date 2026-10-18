import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.pw.ts',
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chrome', screenshot: 'only-on-failure' },
  webServer: { command: 'npm exec vite -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
