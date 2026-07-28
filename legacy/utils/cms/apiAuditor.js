// =============================================================================
//  ApiAuditor — module-aware API audit instrument for the CMS suite.
// =============================================================================
//  A superset of ApiMonitor purpose-built for the "audit every API call across
//  every module" requirement. For each XHR/fetch that matches `apiPattern` it
//  records:  module · url · method · status · response-time(ms) · timestamp.
//
//  It also tags failures (4xx/5xx + transport), slow calls (> slowMs) and
//  critical calls (> criticalMs), and tracks per-module frontend health
//  (blank/white screen, page exceptions, console errors).
//
//  Reuses ConsoleMonitor's noise list so third-party console spam is ignored.
//
//  Usage:
//    const auditor = new ApiAuditor(page, { slowMs: 2000, criticalMs: 5000 });
//    auditor.setModule('Screens');
//    ... drive the page ...
//    const paths = auditor.writeReports('reports/api-audit');
//    auditor.printSummary();
// =============================================================================

import fs from 'fs';
import path from 'path';
import { ConsoleMonitor } from './consoleMonitor.js';

/** Default classification thresholds (ms), per the audit spec. */
export const THRESHOLDS = { SLOW_MS: 2000, CRITICAL_MS: 5000 };

/**
 * Third-party hosts/paths that are NOT the app's own backend. A `/api/`
 * substring match alone is misleading — Google Maps' SDK URLs contain `/api/`
 * but are `script` requests, not data calls — so we capture by resource type
 * (xhr/fetch) and drop these well-known third parties.
 */
const THIRD_PARTY = [
  /googleapis\.com/i,
  /gstatic\.com/i,
  /google-analytics|googletagmanager|doubleclick/i,
  /sentry\.io|hotjar|mixpanel|segment\.io|intercom/i,
  /\/maps(-api-v3)?\//i,
];

/** Crash / error-boundary copy that indicates a broken render. */
const CRASH_TEXT = [
  /something went wrong/i,
  /application error/i,
  /unexpected error/i,
  /this page (isn'?t|is not) working/i,
  /chunk(?:load)?error/i,
  /loading chunk \d+ failed/i,
  /minified react error/i,
];

/**
 * @typedef {Object} ApiCall
 * @property {string} module     Module the call was attributed to.
 * @property {string} url        Full request URL.
 * @property {string} method     HTTP method.
 * @property {number} status     HTTP status (0 = transport-level failure).
 * @property {number} ms         Response time in milliseconds.
 * @property {string} timestamp  ISO-8601 timestamp of request start.
 * @property {string} [failure]  Transport error text, when status === 0.
 */

/**
 * @typedef {Object} ModuleHealth
 * @property {string}   module
 * @property {string}   [url]
 * @property {boolean}  blankScreen   True if the page rendered no meaningful content.
 * @property {boolean}  crashScreen   True if a crash / error-boundary message was shown.
 * @property {string[]} consoleErrors App-originated console errors (noise filtered).
 * @property {string[]} pageErrors    Uncaught exceptions / unhandled rejections.
 */

export class ApiAuditor {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{includeUrl?:RegExp, excludeUrl?:RegExp, slowMs?:number, criticalMs?:number}} [opts]
   *   includeUrl — if set, only capture XHR/fetch whose URL matches (restrict).
   *   excludeUrl — additional URLs to drop, on top of the built-in third-party list.
   */
  constructor(page, opts = {}) {
    this.page = page;
    // Optional restrict/extra-exclude regexes. Capture is by resource type.
    this.includeUrl = opts.includeUrl ?? null;
    this.excludeUrl = opts.excludeUrl ?? null;
    this.slowMs = opts.slowMs ?? THRESHOLDS.SLOW_MS;
    this.criticalMs = opts.criticalMs ?? THRESHOLDS.CRITICAL_MS;

    /** @type {string} */
    this.module = 'unknown';
    /** @type {ApiCall[]} */
    this.calls = [];
    /** @type {Record<string, ModuleHealth>} */
    this.health = {};

    /** in-flight request → { t, module } */
    this._starts = new Map();

    this._attach();
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  /** Switch the module that subsequent traffic/health is attributed to. */
  setModule(name) {
    this.module = name;
    if (!this.health[name]) {
      this.health[name] = {
        module: name,
        blankScreen: false,
        crashScreen: false,
        consoleErrors: [],
        pageErrors: [],
      };
    }
    return this;
  }

  /** True for the app's own data calls (XHR/fetch), minus third-party noise. */
  _isApi(req) {
    const rt = req.resourceType();
    if (rt !== 'xhr' && rt !== 'fetch') return false;
    const url = req.url();
    if (THIRD_PARTY.some((re) => re.test(url))) return false;
    if (this.excludeUrl && this.excludeUrl.test(url)) return false;
    if (this.includeUrl && !this.includeUrl.test(url)) return false;
    return true;
  }

  _attach() {
    this.page.on('request', (req) => {
      if (this._isApi(req)) {
        this._starts.set(req, { t: Date.now(), module: this.module });
      }
    });

    this.page.on('response', (res) => {
      const req = res.request();
      if (!this._isApi(req)) return;
      const meta = this._starts.get(req) ?? { t: Date.now(), module: this.module };
      this._starts.delete(req);
      this.calls.push({
        module: meta.module,
        url: res.url(),
        method: req.method(),
        status: res.status(),
        ms: Date.now() - meta.t,
        timestamp: new Date(meta.t).toISOString(),
      });
    });

    // Transport-level failures (DNS, reset, aborted) — recorded as status 0.
    this.page.on('requestfailed', (req) => {
      if (!this._isApi(req)) return;
      const meta = this._starts.get(req) ?? { t: Date.now(), module: this.module };
      this._starts.delete(req);
      this.calls.push({
        module: meta.module,
        url: req.url(),
        method: req.method(),
        status: 0,
        ms: Date.now() - meta.t,
        timestamp: new Date(meta.t).toISOString(),
        failure: req.failure()?.errorText ?? 'transport failure',
      });
    });

    // Console errors (noise filtered) attributed to the current module.
    this.page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (ConsoleMonitor.isNoise(text)) return;
      this._ensure().consoleErrors.push(text);
    });

    // Uncaught exceptions / React render crashes surface here.
    this.page.on('pageerror', (err) => {
      this._ensure().pageErrors.push(String(err?.message ?? err));
    });
  }

  _ensure() {
    return this.health[this.module] ?? this.setModule(this.module).health[this.module];
  }

  /**
   * Probe the currently-rendered page for blank-screen / crash-screen and store
   * the result against the current module. Call after a module has settled.
   * @param {import('@playwright/test').Page} page
   */
  async recordPageHealth(page = this.page) {
    const h = this._ensure();
    h.url = page.url();

    h.blankScreen = !(await page
      .evaluate(() => {
        const text = (document.body?.innerText ?? '').trim();
        const interactive = document.querySelectorAll(
          'a, button, input, table, [role="button"], [role="link"], nav, main, img'
        ).length;
        return text.length > 20 || interactive > 3;
      })
      .catch(() => true)); // evaluation failure ⇒ treat as blank

    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    h.crashScreen = CRASH_TEXT.some((re) => re.test(body));
    return h;
  }

  // ── classification ──────────────────────────────────────────────────────────

  get failed() {
    return this.calls.filter((c) => c.status === 0 || c.status >= 400);
  }
  get serverErrors() {
    return this.calls.filter((c) => c.status >= 500);
  }
  get clientErrors() {
    return this.calls.filter((c) => c.status >= 400 && c.status < 500);
  }
  get successful() {
    return this.calls.filter((c) => c.status >= 200 && c.status < 400);
  }
  get slow() {
    return this.calls.filter((c) => c.ms > this.slowMs);
  }
  get critical() {
    return this.calls.filter((c) => c.ms > this.criticalMs);
  }
  /** Modules whose page rendered blank, crashed, or threw exceptions. */
  get unhealthyModules() {
    return Object.values(this.health).filter(
      (h) => h.blankScreen || h.crashScreen || h.pageErrors.length > 0
    );
  }

  summary() {
    return {
      total: this.calls.length,
      successful: this.successful.length,
      failed: this.failed.length,
      clientErrors: this.clientErrors.length,
      serverErrors: this.serverErrors.length,
      slow: this.slow.length,
      critical: this.critical.length,
      slowestMs: this.calls.reduce((m, c) => Math.max(m, c.ms), 0),
      modulesAudited: Object.keys(this.health).length,
      unhealthyModules: this.unhealthyModules.map((h) => h.module),
    };
  }

  // ── reporting ────────────────────────────────────────────────────────────────

  /** Build the structured JSON report object. */
  toReport() {
    return {
      generatedAt: new Date().toISOString(),
      baseUrl: this.page.url(),
      thresholds: { slowMs: this.slowMs, criticalMs: this.criticalMs },
      summary: this.summary(),
      health: Object.values(this.health),
      calls: this.calls,
    };
  }

  /**
   * Write api-report.json, api-report.csv and failed-api-report.csv into `dir`.
   * @returns {{json:string, csv:string, failedCsv:string}}
   */
  writeReports(dir) {
    fs.mkdirSync(dir, { recursive: true });

    const json = path.join(dir, 'api-report.json');
    const csv = path.join(dir, 'api-report.csv');
    const failedCsv = path.join(dir, 'failed-api-report.csv');

    fs.writeFileSync(json, JSON.stringify(this.toReport(), null, 2), 'utf8');
    fs.writeFileSync(csv, toCsv(this.calls), 'utf8');
    fs.writeFileSync(failedCsv, toCsv(this.failed), 'utf8');

    return { json, csv, failedCsv };
  }

  /** Pretty-print the summary, a markdown results table, and outliers. */
  printSummary({ maxTableRows = 200 } = {}) {
    const s = this.summary();

    console.log('\n' + '='.repeat(74));
    console.log('  CMS API AUDIT — RESULTS');
    console.log('='.repeat(74));

    // Markdown results table (matches the requested report format).
    const rows = this.calls.slice(0, maxTableRows).map((c) => [
      c.module,
      shortenUrl(c.url),
      c.method,
      c.status === 0 ? 'ERR' : String(c.status),
      formatMs(c.ms),
    ]);
    console.log(
      mdTable(['Module', 'API', 'Method', 'Status', 'Response Time'], rows)
    );
    if (this.calls.length > maxTableRows) {
      console.log(`  …${this.calls.length - maxTableRows} more rows in api-report.csv`);
    }

    // Outliers.
    printGroup('FAILED APIs (4xx / 5xx / transport)', this.failed);
    printGroup(`SLOW APIs (> ${this.slowMs}ms)`, this.slow);
    printGroup(`CRITICAL APIs (> ${this.criticalMs}ms)`, this.critical);

    if (this.unhealthyModules.length) {
      console.log('\n  FRONTEND HEALTH ISSUES:');
      for (const h of this.unhealthyModules) {
        const flags = [
          h.blankScreen && 'blank-screen',
          h.crashScreen && 'crash-screen',
          h.pageErrors.length && `${h.pageErrors.length} exception(s)`,
          h.consoleErrors.length && `${h.consoleErrors.length} console-error(s)`,
        ]
          .filter(Boolean)
          .join(', ');
        console.log(`   • ${h.module}: ${flags}`);
      }
    }

    // Headline totals (exact labels requested).
    console.log('\n  ' + '-'.repeat(40));
    console.log(`  Total APIs Called : ${s.total}`);
    console.log(`  Successful APIs   : ${s.successful}`);
    console.log(`  Failed APIs       : ${s.failed}`);
    console.log(`  Slow APIs         : ${s.slow}`);
    console.log(`  Critical APIs     : ${s.critical}`);
    console.log('  ' + '-'.repeat(40) + '\n');

    return s;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Format ms as "320ms" or "2.8s" (matches the requested table). */
export function formatMs(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Trim the origin so the table shows the path (+ query) only. */
function shortenUrl(url) {
  try {
    const u = new URL(url);
    return (u.pathname + u.search).slice(0, 60);
  } catch {
    return url.slice(0, 60);
  }
}

/** RFC-4180-ish CSV escaping. */
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise ApiCall rows to CSV. */
function toCsv(calls) {
  const headers = ['Module', 'API URL', 'Method', 'Status', 'Response Time (ms)', 'Request Timestamp', 'Failure'];
  const lines = [headers.join(',')];
  for (const c of calls) {
    lines.push(
      [c.module, c.url, c.method, c.status, c.ms, c.timestamp, c.failure ?? ''].map(csvCell).join(',')
    );
  }
  return lines.join('\n') + '\n';
}

/** Render a GitHub-flavoured markdown table. */
function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

/** Print a labelled list of outlier calls (capped). */
function printGroup(label, calls) {
  console.log(`\n  ${label}: ${calls.length}`);
  for (const c of calls.slice(0, 25)) {
    const code = c.status === 0 ? `ERR(${c.failure ?? 'transport'})` : c.status;
    console.log(`   • [${c.module}] ${c.method} ${shortenUrl(c.url)} → ${code} (${formatMs(c.ms)})`);
  }
  if (calls.length > 25) console.log(`   …${calls.length - 25} more`);
}

export default ApiAuditor;
