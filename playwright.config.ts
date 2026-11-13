import { defineConfig, devices } from '@playwright/test';

/** Port of the preview server. Another one lets two checkouts run their tests at the same time. */
const port = Number(process.env.E2E_PORT ?? 4173);
const origin = `http://localhost:${port}`;
/** The dev server, for the tests of what has no button yet: its modules can be imported by address. */
const devPort = port + 1;
export const DEV_ORIGIN = `http://localhost:${devPort}`;

/**
 * The editor is shaders from end to end, and SwiftShader runs them on the CPU, so the tests use the
 * real GPU. `E2E_GPU=0` brings SwiftShader back, for a machine without one.
 */
const ANGLE: Partial<Record<NodeJS.Platform, string>> = { win32: 'd3d11', darwin: 'metal', linux: 'gl' };
const gpu = process.env.E2E_GPU !== '0';
const args = gpu
  ? [`--use-angle=${ANGLE[process.platform] ?? 'default'}`, '--ignore-gpu-blocklist', '--enable-gpu']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

/** A Chromium already on the machine, for when the one this version of Playwright downloads is not there. */
const executablePath = process.env.E2E_CHROME || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  // Every test opens its own browser context, so tests share nothing and can run side by side.
  fullyParallel: true,
  // Six of eight cores ran the suite in 2.4 min, against 3.3 min with four and 14 min with one on SwiftShader.
  // `npm run e2e -- --workers=N` changes it for one run.
  workers: '75%',
  reporter: [['list']],
  use: {
    baseURL: origin,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args, executablePath },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npm run preview -- --port ${port} --strictPort`,
      url: origin,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --port ${devPort} --strictPort`,
      url: DEV_ORIGIN,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
