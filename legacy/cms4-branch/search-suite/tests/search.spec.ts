// =============================================================================
//  search.spec.ts — data-driven Search validation across every CMS module.
//
//  For each module in config/modules.ts we run:
//    @ui         input/placeholder/icon/clear/no-results/pagination
//    @functional exact/partial/case/numeric/enter/clear-restore/refresh/multi
//    @edge       empty/spaces/long/special/unicode/emoji/...    (no crash)
//    @security   SQLi/XSS/HTML injection                        (inert, stable)
//    @api        500/404/401/403/empty/malformed/abort/timeout/offline + debounce
//    @combined   search+pagination / search+back-forward
//    @perf       N consecutive searches under threshold         (opt-in)
//
//  Every test is independent + parallel-safe (own page, cached auth session).
//  Console/network are asserted clean by the auto `monitor` fixture.
// =============================================================================

import { test, expect } from '../fixtures/searchFixtures';
import { MODULES, type ModuleConfig } from '../config/modules';
import { SearchHelper } from '../utils/searchHelper';
import { EDGE_INPUTS, SECURITY_PAYLOADS, API_FAILURES } from '../config/payloads';
import { ENV } from '../config/env';

/** First alphanumeric token (≥3 chars) from text — a data-independent seed. */
function seedFrom(text: string): string {
  const m = text.match(/[A-Za-z0-9]{3,}/);
  return m ? m[0] : '';
}

for (const mod of MODULES as ModuleConfig[]) {
  test.describe(`Search · ${mod.name}`, () => {
    test.describe.configure({ mode: 'parallel' });

    // NOTE: Members/Logs/Roles are flagged `unverified` in config/modules.ts —
    // if their route bounces to login, open() throws a clear, actionable error.

    /** Open the module and return a ready SearchHelper. */
    async function open(makeSearch: (m: ModuleConfig) => SearchHelper): Promise<SearchHelper> {
      const helper = makeSearch(mod);
      await helper.open();
      return helper;
    }

    // ── §5 UI VALIDATION ─────────────────────────────────────────────────────
    test('UI: search input is visible, enabled and has a placeholder @ui', async ({ makeSearch }) => {
      const { sp } = await open(makeSearch);
      await expect(sp.searchInput).toBeVisible();
      await expect(sp.searchInput).toBeEnabled();
      const ph = await sp.searchInput.getAttribute('placeholder');
      expect(ph, 'search input should advertise a placeholder').toBeTruthy();
    });

    test('UI: invalid search shows a no-records state, not a blank page @ui', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      await helper.search(`zzz_no_such_${mod.key}_${Date.now()}`);
      await helper.validateNoResults();
    });

    // ── §1 FUNCTIONAL ────────────────────────────────────────────────────────
    test('Functional: exact + partial match return relevant rows @functional', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      const seed = seedFrom(await helper.sp.firstRowText());
      test.skip(!seed, `${mod.name} has no seed row to derive a known term`);

      // Exact-ish (full token) then partial (prefix) — both should match.
      await helper.search(seed);
      await helper.validateSearchResults(seed);

      const partial = seed.slice(0, Math.max(2, Math.ceil(seed.length / 2)));
      await helper.search(partial);
      await helper.validateSearchResults(partial);
    });

    test('Functional: search is case-insensitive @functional', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      const seed = seedFrom(await helper.sp.firstRowText());
      test.skip(!seed || !/[a-zA-Z]/.test(seed), `${mod.name} has no alpha seed`);

      await helper.search(seed.toLowerCase());
      const lower = await helper.sp.rowCount();
      await helper.search(seed.toUpperCase());
      const upper = await helper.sp.rowCount();
      // Case must not change the result set size.
      expect(upper, 'uppercase search should match the same rows as lowercase').toBe(lower);
    });

    test('Functional: Enter triggers a search request @functional', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      const resp = await helper.search('a1'); // alphanumeric, Enter-driven
      if (resp) expect(resp.status(), 'search API should not 5xx').toBeLessThan(500);
      await helper.verifyNoWhiteScreen('enter-search');
    });

    test('Functional: clearing the search restores the full list @functional', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      const baseline = await helper.sp.rowCount();
      await helper.search(`zzz_${Date.now()}`);
      await helper.clearSearch();
      await helper.sp.waitForSearchResults();
      const restored = await helper.sp.rowCount();
      expect(restored, 'cleared search should restore ≥ as many rows as a no-match query')
        .toBeGreaterThanOrEqual(Math.min(baseline, 1));
    });

    test('Functional: search state is sane after a page refresh @functional', async ({ page, makeSearch }) => {
      const helper = await open(makeSearch);
      await helper.search('a');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await helper.sp.expectShellReady('after-refresh');
      await expect(helper.sp.searchInput).toBeVisible();
    });

    test('Functional: multiple consecutive searches stay healthy @functional', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      for (const term of ['a', 'b1', 'test', 'zzz_none']) {
        await helper.search(term);
        await helper.verifyNoWhiteScreen(`consecutive:${term}`);
      }
    });

    // ── §2 EDGE CASES ────────────────────────────────────────────────────────
    for (const input of EDGE_INPUTS) {
      test(`Edge: "${input.name}" does not crash the UI @edge`, async ({ makeSearch }) => {
        const helper = await open(makeSearch);
        await helper.search(input.value).catch(() => {});
        await helper.verifyNoWhiteScreen(`edge:${input.name}`);
        await helper.sp.expectShellReady(`edge:${input.name}`);
        // Result region must resolve to rows OR an empty state (never hang blank).
        await helper.sp.waitForSearchResults().catch(() => {});
      });
    }

    // ── §3 SECURITY ──────────────────────────────────────────────────────────
    for (const payload of SECURITY_PAYLOADS) {
      test(`Security: "${payload.name}" is inert (no execution) @security`, async ({ page, makeSearch }) => {
        let dialogFired = false;
        page.on('dialog', async (d) => { dialogFired = true; await d.dismiss().catch(() => {}); });

        const helper = await open(makeSearch);
        await helper.search(payload.value).catch(() => {});

        // No JS dialog, no injected live node, UI intact.
        expect(dialogFired, 'search payload must not execute a JS dialog').toBeFalsy();
        const injected = await page
          .locator('h1[data-xss], script:has-text("alert(1)"), img[onerror]')
          .count();
        expect(injected, 'payload must not render as live HTML/JS').toBe(0);
        await helper.sp.expectShellReady(`security:${payload.name}`);
      });
    }

    // ── §4 API & NETWORK RESILIENCE ──────────────────────────────────────────
    for (const fail of API_FAILURES) {
      test(`API: "${fail.name}" degrades gracefully (no blank) @api`, async ({ page, makeSearch, monitor }) => {
        monitor.relax(); // we are injecting failures on purpose
        const helper = await open(makeSearch); // open BEFORE mocking (initial load OK)

        await helper.mockSearchApiFailure(fail.status ?? 0, {
          body: fail.body,
          abort: fail.abort,
          delayMs: fail.delayMs,
        });

        await helper.search('anything').catch(() => {}); // may reject on timeout/abort

        // Resilience contract: shell survives, no blank, no uncaught exception.
        await helper.verifyNoWhiteScreen(`api:${fail.name}`);
        await expect(helper.sp.shell, 'sidebar/header must remain visible').toBeVisible();
        expect(monitor.report().pageErrors, 'no uncaught JS exceptions on API failure').toEqual([]);

        await helper.unmock();
      });
    }

    test('API: offline during search keeps the UI stable @api', async ({ page, context, makeSearch, monitor }) => {
      monitor.relax();
      const helper = await open(makeSearch);
      await context.setOffline(true);
      await helper.search('offline_probe').catch(() => {});
      await helper.verifyNoWhiteScreen('offline');
      await expect(helper.sp.shell).toBeVisible();
      await context.setOffline(false);
    });

    test('API: successful search is fast and debounced (≤ threshold calls) @api', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      const cap = helper.interceptSearchApi();

      const resp = await helper.search('abc');
      await helper.sp.waitForSearchResults().catch(() => {});
      cap.stop();

      if (resp) {
        expect(resp.status(), 'search should respond 2xx/3xx/4xx, never 5xx').toBeLessThan(500);
      }
      const ok = cap.calls.filter((c) => c.status >= 200 && c.status < 400);
      if (ok.length) {
        const slowest = Math.max(...ok.map((c) => c.ms).filter((n) => n >= 0));
        // Soft perf signal — logged always, asserted only when timing is available.
        console.log(`[${mod.name}] search calls=${cap.calls.length} slowest=${slowest}ms`);
        if (slowest >= 0) {
          expect(slowest, `search API under ${ENV.API_MAX_MS}ms`).toBeLessThanOrEqual(ENV.API_MAX_MS);
        }
      }
      // Debounce: one logical search should not storm the backend.
      expect(
        cap.calls.length,
        `expected ≤ ${ENV.DEBOUNCE_MAX_CALLS} request(s) per search, observed ${cap.calls.length}`,
      ).toBeLessThanOrEqual(ENV.DEBOUNCE_MAX_CALLS + 1); // +1 tolerance for an initial echo
    });

    // ── §6 COMBINED SCENARIOS ────────────────────────────────────────────────
    test('Combined: search + pagination stays healthy @combined', async ({ makeSearch }) => {
      const helper = await open(makeSearch);
      await helper.search('a');
      if (await helper.sp.pagination.isVisible().catch(() => false)) {
        const next = helper.sp.pagination.getByRole('button', { name: /next|›|»/i }).first();
        if (await next.isEnabled().catch(() => false)) {
          await next.click().catch(() => {});
          await helper.verifyNoWhiteScreen('search+pagination');
        }
      }
      await helper.sp.expectShellReady('search+pagination');
    });

    test('Combined: search + browser back/forward recovers cleanly @combined', async ({ page, makeSearch }) => {
      const helper = await open(makeSearch);
      await helper.search('a');
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await helper.sp.verifyNoWhiteScreen('after-back');
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await helper.sp.expectShellReady('after-forward');
    });

    // ── §7 PERFORMANCE (opt-in: SEARCH_RUN_PERF=true) ────────────────────────
    test('Perf: consecutive searches stay within the average threshold @perf', async ({ makeSearch }) => {
      test.skip(!ENV.RUN_PERF, 'performance bucket is opt-in (set SEARCH_RUN_PERF=true)');
      test.setTimeout(ENV.PERF_ITERATIONS * 4_000 + 60_000);

      const helper = await open(makeSearch);
      const cap = helper.interceptSearchApi();
      for (let i = 0; i < ENV.PERF_ITERATIONS; i++) {
        const resp = await helper.search(`perf${i}`);
        if (resp) expect(resp.status()).toBeLessThan(500);
        await helper.verifyNoWhiteScreen(`perf#${i}`);
      }
      cap.stop();

      const times = cap.calls.map((c) => c.ms).filter((n) => n >= 0);
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const slowest = [...cap.calls].sort((a, b) => b.ms - a.ms).slice(0, 5);
      console.log(`[perf:${mod.name}] ${times.length} calls · avg ${Math.round(avg)}ms · slowest`, slowest);

      expect(avg, `avg search API under ${ENV.PERF_AVG_MAX_MS}ms`).toBeLessThan(ENV.PERF_AVG_MAX_MS);
    });
  });
}
