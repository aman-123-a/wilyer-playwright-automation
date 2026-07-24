// =============================================================================
//  Passive monitors — collect console errors and 5xx responses per test.
// =============================================================================
//  Attach once per page (the fixtures do this). In STRICT mode a violation
//  fails the test; otherwise it is attached to the report as an annotation.
// =============================================================================
import type { Page, TestInfo, ConsoleMessage, Response } from '@playwright/test';
import { ENV } from '../config/env';

// Known-benign noise on this app (e.g. the documented login 401 console error,
// analytics beacons). Extend as confirmed — keep tight to avoid masking bugs.
const BENIGN = [
  /401.*login/i,
  /favicon/i,
  /ResizeObserver loop/i,
  /Failed to load resource: net::ERR_/i, // beacons / 3rd-party
];

export interface Monitor {
  consoleErrors: string[];
  serverErrors: string[];
  assert(testInfo: TestInfo): void;
}

export function attachMonitors(page: Page): Monitor {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });

  page.on('response', (res: Response) => {
    if (res.status() >= 500) {
      serverErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  return {
    consoleErrors,
    serverErrors,
    assert(testInfo: TestInfo) {
      if (consoleErrors.length) {
        testInfo.annotations.push({ type: 'console-error', description: consoleErrors.slice(0, 10).join('\n') });
      }
      if (serverErrors.length) {
        testInfo.annotations.push({ type: 'server-5xx', description: serverErrors.slice(0, 10).join('\n') });
      }
      if (ENV.STRICT_MONITORS) {
        if (consoleErrors.length) throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
        if (serverErrors.length) throw new Error(`Server 5xx responses detected:\n${serverErrors.join('\n')}`);
      }
    },
  };
}
