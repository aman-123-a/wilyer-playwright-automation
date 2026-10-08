// =============================================================================
//  API failure-injection toolkit — wraps page.route() with named scenarios.
// =============================================================================
//  Used by every "API failure" / "failure injection" test. Each helper installs
//  a route handler for a URL glob and returns an unroute() disposer so a test
//  can scope the failure to a single action.
//
//  Design notes:
//   • We only intercept the FIRST matching request by default for "timeout" so
//     the page can still recover on retry — pass {persist:true} to keep failing.
//   • Handlers are abortable/fulfillable; we never silently pass through unless
//     asked, so the failure is deterministic.
// =============================================================================
import type { Page, Route, Request } from '@playwright/test';

export type Scenario =
  | 'http500'
  | 'http404'
  | 'http401'
  | 'http403'
  | 'http429'
  | 'timeout'
  | 'emptyArray'
  | 'nullBody'
  | 'malformedJson'
  | 'networkError';

export interface InjectOptions {
  /** Keep failing for the whole test (default). If false, fail once then pass through. */
  persist?: boolean;
  /** Only intercept requests whose method matches (e.g. 'POST'). */
  method?: string;
  /** Artificial delay (ms) before fulfilling — used by the slow/timeout scenario. */
  delayMs?: number;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

async function applyScenario(route: Route, scenario: Scenario, opts: InjectOptions) {
  switch (scenario) {
    case 'http500':
      return route.fulfill({ status: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Internal Server Error' }) });
    case 'http404':
      return route.fulfill({ status: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Not Found' }) });
    case 'http401':
      return route.fulfill({ status: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) });
    case 'http403':
      return route.fulfill({ status: 403, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Forbidden' }) });
    case 'http429':
      return route.fulfill({ status: 429, headers: { ...JSON_HEADERS, 'retry-after': '5' }, body: JSON.stringify({ error: 'Too Many Requests' }) });
    case 'emptyArray':
      return route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ data: [], results: [], items: [] }) });
    case 'nullBody':
      return route.fulfill({ status: 200, headers: JSON_HEADERS, body: 'null' });
    case 'malformedJson':
      return route.fulfill({ status: 200, headers: JSON_HEADERS, body: '{"data": [ {"id": 1, ' });
    case 'networkError':
      return route.abort('failed');
    case 'timeout': {
      // Hang long enough that the app's own timeout/error path fires.
      await new Promise((r) => setTimeout(r, opts.delayMs ?? 35_000));
      return route.abort('timedout');
    }
    default:
      return route.continue();
  }
}

/**
 * Install a failure scenario on a URL glob. Returns an async disposer.
 *
 * @example
 *   const stop = await inject(page, '**\/api/**\/screen**', 'http500');
 *   await screensPage.reload();
 *   ...assert recovery...
 *   await stop();
 */
export async function inject(
  page: Page,
  urlGlob: string,
  scenario: Scenario,
  opts: InjectOptions = {},
): Promise<() => Promise<void>> {
  const { persist = true, method } = opts;
  let fired = false;

  const handler = async (route: Route, request: Request) => {
    if (method && request.method().toUpperCase() !== method.toUpperCase()) {
      return route.continue();
    }
    if (!persist && fired) {
      return route.continue();
    }
    fired = true;
    await applyScenario(route, scenario, opts);
  };

  await page.route(urlGlob, handler);
  return async () => {
    await page.unroute(urlGlob, handler);
  };
}

/**
 * Run `action` with a scenario injected on `urlGlob`, then always clean up.
 * Keeps tests tidy and guarantees the route is removed even on assertion fail.
 */
export async function withFailure<T>(
  page: Page,
  urlGlob: string,
  scenario: Scenario,
  action: () => Promise<T>,
  opts: InjectOptions = {},
): Promise<T> {
  const stop = await inject(page, urlGlob, scenario, opts);
  try {
    return await action();
  } finally {
    await stop();
  }
}

/** Convenience: fulfil a glob with a fixed JSON body (for empty/seeded data). */
export async function stubJson(
  page: Page,
  urlGlob: string,
  body: unknown,
  status = 200,
): Promise<() => Promise<void>> {
  const handler = (route: Route) =>
    route.fulfill({ status, headers: JSON_HEADERS, body: JSON.stringify(body) });
  await page.route(urlGlob, handler);
  return async () => page.unroute(urlGlob, handler);
}

export const SCENARIOS: Scenario[] = [
  'http500', 'http404', 'http401', 'http403', 'timeout',
  'emptyArray', 'nullBody', 'malformedJson', 'networkError',
];
