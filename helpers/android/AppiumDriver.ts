// =============================================================================
//  Appium driver — the UI half of Android player testing.
//
//  Appium is a W3C WebDriver server: a plain HTTP+JSON protocol. That means the
//  whole client is a few typed request helpers, and this suite does NOT need
//  webdriverio pulled in beside Playwright — one HTTP client, one runner, one
//  set of types, and no second async ecosystem to keep in step. Playwright's
//  APIRequestContext does the transport.
//
//  Prerequisites on the machine running the tests:
//
//      npm i -g appium
//      appium driver install uiautomator2
//      appium                       # listens on 127.0.0.1:4723
//
//  Use this for screens with real widgets — pairing, settings, configuration.
//  For playback, storage and stability, prefer Adb: a full-screen video has no
//  elements to query and Appium would only add seconds of session setup.
// =============================================================================

import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { ANDROID } from '../../config/android';

/** W3C element handle key — fixed by the spec, not by Appium. */
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

/** Locator strategies UiAutomator2 accepts. */
export type Using = 'id' | 'accessibility id' | 'xpath' | 'class name' | '-android uiautomator';

export interface Selector {
  using: Using;
  value: string;
  /** Human form for error messages, e.g. `~settings`. */
  readonly label: string;
}

/**
 * Locator builders. Prefer `accessibilityId` — it is stable across layout
 * refactors and, unlike an xpath, does not walk the whole hierarchy per call.
 */
export const by = {
  /** contentDescription. The best default for an app you control. */
  accessibilityId: (value: string): Selector => ({
    using: 'accessibility id',
    value,
    label: `~${value}`,
  }),

  /** Resource id. Bare names are resolved against the player package. */
  id: (value: string): Selector => ({
    using: 'id',
    value: value.includes(':id/') ? value : `${ANDROID.PACKAGE}:id/${value}`,
    label: `#${value}`,
  }),

  xpath: (value: string): Selector => ({ using: 'xpath', value, label: value }),

  className: (value: string): Selector => ({ using: 'class name', value, label: value }),

  /** Raw UiSelector — the escape hatch, and the only way to scroll-into-view. */
  uiSelector: (value: string): Selector => ({
    using: '-android uiautomator',
    value,
    label: value,
  }),

  /** Exact visible text. */
  text: (value: string): Selector =>
    by.uiSelector(`new UiSelector().text(${JSON.stringify(value)})`),

  /** Substring of visible text — what you want for a title that gets truncated. */
  textContains: (value: string): Selector =>
    by.uiSelector(`new UiSelector().textContains(${JSON.stringify(value)})`),
} as const;

interface WebDriverResponse<T> {
  value: T;
}

/** A resolved element handle. Stale once the screen changes — re-find, do not cache. */
export class AndroidElement {
  constructor(
    private readonly driver: AppiumDriver,
    readonly id: string,
    readonly selector: Selector,
  ) {}

  async click(): Promise<void> {
    await this.driver.post(`/element/${this.id}/click`, {});
  }

  /** Types into the field. Does not clear first — call `clear()` when replacing. */
  async type(text: string): Promise<void> {
    await this.driver.post(`/element/${this.id}/value`, { text });
  }

  async clear(): Promise<void> {
    await this.driver.post(`/element/${this.id}/clear`, {});
  }

  async text(): Promise<string> {
    return this.driver.get<string>(`/element/${this.id}/text`);
  }

  async attribute(name: string): Promise<string | null> {
    return this.driver.get<string | null>(`/element/${this.id}/attribute/${name}`);
  }

  async isDisplayed(): Promise<boolean> {
    return this.driver.get<boolean>(`/element/${this.id}/displayed`);
  }

  async isEnabled(): Promise<boolean> {
    return this.driver.get<boolean>(`/element/${this.id}/enabled`);
  }
}

export class AppiumDriver {
  private constructor(
    private readonly api: APIRequestContext,
    readonly sessionId: string,
    readonly capabilities: Record<string, unknown>,
  ) {}

  // ─── Session ──────────────────────────────────────────────────────────────

  /**
   * Open a session against the configured device.
   *
   * `noReset` is on by default: a signage player is paired to a CMS account,
   * and wiping its data mid-suite would unenroll the screen and invalidate
   * every later test. Pass `{ reset: true }` only in a spec that re-pairs.
   */
  static async start(options: { reset?: boolean; extraCaps?: Record<string, unknown> } = {}) {
    if (!ANDROID.PACKAGE) {
      throw new Error('ANDROID_APP_PACKAGE is not set — cannot start an Appium session.');
    }

    const api = await request.newContext({
      baseURL: ANDROID.APPIUM_URL,
      timeout: ANDROID.SESSION_TIMEOUT_MS,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });

    const alwaysMatch: Record<string, unknown> = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': ANDROID.PACKAGE,
      'appium:noReset': options.reset !== true,
      // Appium kills an idle session; a soak spec that watches playback for ten
      // minutes without touching the UI must not have the session pulled away.
      'appium:newCommandTimeout': 600,
      ...(ANDROID.ACTIVITY ? { 'appium:appActivity': ANDROID.ACTIVITY } : {}),
      ...(ANDROID.UDID ? { 'appium:udid': ANDROID.UDID } : {}),
      ...options.extraCaps,
    };

    const response = await api.post('/session', {
      data: { capabilities: { alwaysMatch, firstMatch: [{}] } },
      timeout: ANDROID.SESSION_TIMEOUT_MS,
    });

    const body = (await AppiumDriver.unwrap(response, 'POST /session')) as {
      sessionId?: string;
      capabilities?: Record<string, unknown>;
    };

    const sessionId = body.sessionId;
    if (!sessionId) {
      throw new Error(`Appium did not return a sessionId: ${JSON.stringify(body)}`);
    }

    return new AppiumDriver(api, sessionId, body.capabilities ?? {});
  }

  /** Always call this — an orphaned session holds the device against the next test. */
  async stop(): Promise<void> {
    await this.api.delete(`/session/${this.sessionId}`).catch(() => undefined);
    await this.api.dispose();
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  /**
   * WebDriver signals failure two ways: an HTTP error status, and a 200 whose
   * body carries `value.error`. Both are handled here so callers never have to
   * pattern-match on a raw response.
   */
  private static async unwrap(response: APIResponse, what: string): Promise<unknown> {
    const text = await response.text();
    let parsed: WebDriverResponse<unknown> | undefined;
    try {
      parsed = JSON.parse(text) as WebDriverResponse<unknown>;
    } catch {
      throw new Error(`${what} returned non-JSON (${response.status()}): ${text.slice(0, 400)}`);
    }

    const value = parsed.value as { error?: string; message?: string } | null;
    if (!response.ok() || (value && typeof value === 'object' && value.error)) {
      const detail = value?.message ?? value?.error ?? text.slice(0, 400);
      throw new Error(`${what} failed (${response.status()}): ${detail}`);
    }
    return parsed.value;
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.api.get(`/session/${this.sessionId}${path}`);
    return (await AppiumDriver.unwrap(response, `GET ${path}`)) as T;
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const response = await this.api.post(`/session/${this.sessionId}${path}`, { data });
    return (await AppiumDriver.unwrap(response, `POST ${path}`)) as T;
  }

  // ─── Finding ──────────────────────────────────────────────────────────────

  /** Find once, no waiting. Throws when absent — use `find` for the polling form. */
  async findNow(selector: Selector): Promise<AndroidElement> {
    const value = await this.post<Record<string, string>>('/element', {
      using: selector.using,
      value: selector.value,
    });
    return new AndroidElement(this, value[ELEMENT_KEY], selector);
  }

  async findAll(selector: Selector): Promise<AndroidElement[]> {
    const values = await this.post<Record<string, string>[]>('/elements', {
      using: selector.using,
      value: selector.value,
    });
    return values.map((value) => new AndroidElement(this, value[ELEMENT_KEY], selector));
  }

  /**
   * Poll until the element exists AND is displayed.
   *
   * Explicit polling rather than WebDriver's implicit wait: an implicit wait is
   * global session state that silently slows down every negative assertion too,
   * and it cannot distinguish "present but invisible" from "absent".
   */
  async find(selector: Selector, timeoutMs = ANDROID.ELEMENT_TIMEOUT_MS): Promise<AndroidElement> {
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
      try {
        const element = await this.findNow(selector);
        if (await element.isDisplayed()) return element;
        lastError = 'found but not displayed';
      } catch (error) {
        lastError = (error as Error).message;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(
      `Element ${selector.label} not visible after ${timeoutMs}ms — last: ${lastError}`,
    );
  }

  /**
   * Non-throwing presence check, for asserting something is absent.
   *
   * Named `isElementVisible` rather than `isVisible` so it cannot be mistaken
   * for Playwright's Locator method: this one polls a native Android view and
   * has no auto-retrying `expect` behind it.
   */
  async isElementVisible(selector: Selector, timeoutMs = 3_000): Promise<boolean> {
    try {
      await this.find(selector, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  /** Convenience: find and click in one call. */
  async tap(selector: Selector, timeoutMs = ANDROID.ELEMENT_TIMEOUT_MS): Promise<void> {
    await (await this.find(selector, timeoutMs)).click();
  }

  /** Scroll a list until `text` is on screen, then return the element. */
  async scrollTo(text: string): Promise<AndroidElement> {
    return this.findNow(
      by.uiSelector(
        'new UiScrollable(new UiSelector().scrollable(true).instance(0))' +
          `.scrollIntoView(new UiSelector().textContains(${JSON.stringify(text)}))`,
      ),
    );
  }

  // ─── Device / app control ─────────────────────────────────────────────────

  /** Whole-screen XML. Cheap way to see what a screen actually exposes. */
  async source(): Promise<string> {
    return this.get<string>('/source');
  }

  /** PNG bytes of the current screen. */
  async screenshot(): Promise<Buffer> {
    return Buffer.from(await this.get<string>('/screenshot'), 'base64');
  }

  /** Hardware back. 4 is KEYCODE_BACK. */
  async back(): Promise<void> {
    await this.post('/back', {});
  }

  async pressKeycode(keycode: number): Promise<void> {
    await this.post('/appium/device/press_keycode', { keycode });
  }

  /** Run an Appium `mobile:` extension command, e.g. `mobile: startActivity`. */
  async execute<T>(script: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.post<T>('/execute/sync', { script, args: [args] });
  }

  /** Send the app to the background for `seconds` (-1 = leave it there). */
  async background(seconds: number): Promise<void> {
    await this.post('/appium/app/background', { seconds });
  }

  async currentActivity(): Promise<string> {
    return this.get<string>('/appium/device/current_activity');
  }
}

export default AppiumDriver;
