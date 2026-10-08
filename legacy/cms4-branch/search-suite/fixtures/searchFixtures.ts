// =============================================================================
//  Fixtures — extend Playwright's test with an auto-attached console/network
//  monitor and a per-module SearchHelper factory. Screenshots + traces on
//  failure are configured in playwright.config.ts (retain-on-failure).
// =============================================================================

import { test as base, expect } from '@playwright/test';
import { ConsoleNetworkMonitor } from '../utils/monitors';
import { SearchHelper } from '../utils/searchHelper';
import { type ModuleConfig } from '../config/modules';
import { ENV } from '../config/env';

interface SearchFixtures {
  /** Auto-attached console + network watchdog (asserted on teardown). */
  monitor: ConsoleNetworkMonitor;
  /** Factory: build a SearchHelper for a given module against the current page. */
  makeSearch: (module: ModuleConfig) => SearchHelper;
}

export const test = base.extend<SearchFixtures>({
  monitor: [
    async ({ page }, use, testInfo) => {
      const monitor = new ConsoleNetworkMonitor(page).attach();

      await use(monitor);

      // Persist diagnostics for every test (cheap, invaluable on failure).
      const report = monitor.report();
      await testInfo.attach('console-network-monitor.json', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });

      // Don't pile assertions onto an already-failing test, and skip when the
      // test deliberately injected failures (monitor.relax()).
      if (monitor.relaxed || testInfo.status === 'failed') return;

      const problems = [
        ...report.consoleErrors.map((e) => `console: ${e}`),
        ...report.pageErrors.map((e) => `pageerror: ${e}`),
        ...report.serverErrors.map((s) => `5xx: ${s.status} ${s.url}`),
      ];
      if (ENV.STRICT_CONSOLE) {
        expect(problems, `unexpected console/network errors:\n${problems.join('\n')}`).toEqual([]);
      } else if (problems.length) {
        console.warn(`[monitor] ${testInfo.title} — ${problems.length} non-fatal issue(s):\n${problems.join('\n')}`);
      }
    },
    { auto: true },
  ],

  makeSearch: async ({ page }, use) => {
    await use((module: ModuleConfig) => new SearchHelper(page, module));
  },
});

export { expect };
export default test;
