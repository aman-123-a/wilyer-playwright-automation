// =============================================================================
//  searchHelper — reusable, high-level search utilities built on SearchPage.
//  Exposes the API requested in the spec (search/clearSearch/validate*/intercept
//  /mock*/verifyNoWhiteScreen/capture*). Use the SearchHelper class for stateful
//  flows; the standalone capture* functions are for ad-hoc listeners.
// =============================================================================

import { type Page, type Response, expect } from '@playwright/test';
import { SearchPage } from '../pages/searchPage';
import { type ModuleConfig } from '../config/modules';

export interface CapturedCall { url: string; status: number; ms: number }

export class SearchHelper {
  readonly sp: SearchPage;

  constructor(private readonly page: Page, module: ModuleConfig) {
    this.sp = new SearchPage(page, module);
  }

  open(): Promise<SearchPage> {
    return this.sp.open().then(() => this.sp);
  }

  // ── Thin pass-throughs matching the requested utility signatures ───────────
  search(text: string): Promise<Response | null> { return this.sp.search(text); }
  clearSearch(): Promise<void> { return this.sp.clearSearch(); }
  waitForSearchResults(): Promise<void> { return this.sp.waitForSearchResults(); }
  verifyNoWhiteScreen(ctx?: string): Promise<void> { return this.sp.verifyNoWhiteScreen(ctx); }

  /** Assert results are present AND (when textual) reflect the search term. */
  async validateSearchResults(text: string): Promise<void> {
    await this.sp.waitForSearchResults();
    const count = await this.sp.rowCount();
    if (count === 0) { await this.validateNoResults(); return; }

    const term = text.trim().toLowerCase();
    if (!term) return; // nothing to match against

    const rows = (await this.sp.resultRows.allInnerTexts()).map((t) => t.toLowerCase());
    const matching = rows.filter((t) => t.includes(term)).length;
    expect(matching, `at least one of ${rows.length} rows should contain "${text}"`)
      .toBeGreaterThan(0);
  }

  /** Assert an explicit empty state or zero rows (never a blank page). */
  async validateNoResults(): Promise<void> {
    const emptyMsg = await this.sp.noResults.isVisible().catch(() => false);
    const count = await this.sp.rowCount();
    expect(emptyMsg || count === 0, 'expected a "no records" state or zero rows').toBeTruthy();
    await this.sp.verifyNoWhiteScreen('no-results');
  }

  /**
   * Start counting/timing the module's search API calls.
   * @returns handle with the live `calls` array and a `stop()` detacher.
   */
  interceptSearchApi(): { calls: CapturedCall[]; stop: () => void } {
    const calls: CapturedCall[] = [];
    // Wall-clock timing keyed by request — Playwright's request.timing() is
    // unreliable for some XHRs (returns 0/-1), so we measure start→finish here.
    const started = new WeakMap<object, number>();
    const onReq = (req: { url(): string }) => {
      if (this.sp.module.searchApi.test(req.url())) started.set(req, Date.now());
    };
    const onResp = (r: Response) => {
      if (!this.sp.module.searchApi.test(r.url())) return;
      const t0 = started.get(r.request());
      const ms = t0 ? Date.now() - t0 : -1;
      calls.push({ url: r.url(), status: r.status(), ms });
    };
    this.page.on('request', onReq);
    this.page.on('response', onResp);
    return {
      calls,
      stop: () => { this.page.off('request', onReq); this.page.off('response', onResp); },
    };
  }

  /** Force the search endpoint to fail/empty/abort for resilience tests. */
  async mockSearchApiFailure(
    statusCode: number,
    opts: { body?: string; abort?: boolean; delayMs?: number } = {},
  ): Promise<void> {
    await this.page.route(this.sp.module.searchApi, async (route) => {
      if (opts.abort) return route.abort('failed');
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      await route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: opts.body ?? JSON.stringify({ message: 'mocked failure' }),
      });
    });
  }

  /** Remove any mock installed by mockSearchApiFailure. */
  unmock(): Promise<void> {
    return this.page.unroute(this.sp.module.searchApi).catch(() => {});
  }
}

// ── Standalone capture helpers (ad-hoc, when you don't need a SearchHelper) ───

/** Collect console errors + uncaught exceptions into a live array. */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Collect failed requests + 5xx responses into a live array. */
export function captureFailedRequests(page: Page): { url: string; status?: number; failure?: string }[] {
  const failed: { url: string; status?: number; failure?: string }[] = [];
  page.on('requestfailed', (r) => failed.push({ url: r.url(), failure: r.failure()?.errorText }));
  page.on('response', (r) => { if (r.status() >= 500) failed.push({ url: r.url(), status: r.status() }); });
  return failed;
}

export default SearchHelper;
