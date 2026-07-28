// =============================================================================
//  mocks — network-boundary failure injection via page.route().
// =============================================================================
//  These helpers let browser tests deterministically reproduce backend failure
//  modes that cannot be triggered against a live server (Athena/S3/SMTP errors,
//  500s, slow responses, corrupted payloads, schema drift). We assert how the
//  FRONTEND reacts — no crash, graceful error, loader clears.
//
//  All helpers take a URL glob/RegExp matched by Playwright's routing.
// =============================================================================

/** Respond to matching requests with an HTTP error status + JSON body. */
export async function mockServerError(page, urlPattern, { status = 500, body } = {}) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { error: 'Internal Server Error', message: 'Injected by test' }),
    });
  });
}

/** Delay matching responses by `delayMs` before passing them through. */
export async function mockSlowResponse(page, urlPattern, delayMs = 6000) {
  await page.route(urlPattern, async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
}

/** Return malformed / non-JSON body where JSON is expected (corrupted payload). */
export async function mockCorruptedPayload(page, urlPattern) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{ "data": [ { "id": 1, "na', // truncated, unparseable JSON
    });
  });
}

/** Return a valid-but-empty dataset (empty analytics / empty export result). */
export async function mockEmptyResponse(page, urlPattern, shape = { data: [] }) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(shape),
    });
  });
}

/** Simulate a dropped connection / network interruption. */
export async function mockNetworkFailure(page, urlPattern) {
  await page.route(urlPattern, (route) => route.abort('failed'));
}

/** Simulate an expired / invalid auth token (backend rejects with 401). */
export async function mockUnauthorized(page, urlPattern, status = 401) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized', message: 'Token expired or invalid' }),
    });
  });
}

/**
 * Fetch the real response, parse JSON, run `transform(json)` on it, and return
 * the mutated body. Lets us inject schema drift on real data — e.g. flipping the
 * playlist `screens` field to null / string / negative / huge.
 */
export async function mockTransformJson(page, urlPattern, transform) {
  await page.route(urlPattern, async (route) => {
    const response = await route.fetch();
    let json;
    try {
      json = await response.json();
    } catch {
      // Not JSON — pass through untouched.
      return route.fulfill({ response });
    }
    const mutated = transform(json) ?? json;
    await route.fulfill({
      response,
      contentType: 'application/json',
      body: JSON.stringify(mutated),
    });
  });
}

/**
 * Deep-set every occurrence of `field` (at any depth) to `value`.
 * Handy for "set screens to null / 'NaN' / -5 / 999999999 everywhere".
 */
export function deepSetField(obj, field, value) {
  if (Array.isArray(obj)) {
    obj.forEach((o) => deepSetField(o, field, value));
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === field) obj[k] = value;
      else deepSetField(obj[k], field, value);
    }
  }
  return obj;
}

/** Deep-delete every occurrence of `field` (simulates a missing field). */
export function deepDeleteField(obj, field) {
  if (Array.isArray(obj)) {
    obj.forEach((o) => deepDeleteField(o, field));
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === field) delete obj[k];
      else deepDeleteField(obj[k], field);
    }
  }
  return obj;
}

export default {
  mockServerError,
  mockSlowResponse,
  mockCorruptedPayload,
  mockEmptyResponse,
  mockNetworkFailure,
  mockUnauthorized,
  mockTransformJson,
  deepSetField,
  deepDeleteField,
};
