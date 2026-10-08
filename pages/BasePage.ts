// =============================================================================
//  BasePage — shared behaviour for every CMS page object.
//  Holds the authenticated app shell helpers (sidebar nav, breadcrumb, the
//  shared "Are you sure?" confirm dialog) so module pages stay focused on their
//  own surface.
// =============================================================================

import { type Page, type Locator, expect } from '@playwright/test';

/** Sidebar nav routes confirmed live against cms.pocsample.in. */
export const ROUTES = {
  dashboard: '/',
  screens: '/screens',
  groups: '/groups',
  clusters: '/clusters',
  library: '/library',
  rollouts: '/content-rollout',
  playlists: '/playlists',
  team: '/team',
  reports: '/reports',
  whatsNew: '/whats-new',
  help: '/help',
  feedback: '/feedback',
  billing: '/billing',
  account: '/account',
} as const;

export class BasePage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly sidebarList: Locator;
  readonly userEmail: Locator;
  readonly logoutLink: Locator;
  readonly dashboardLink: Locator;
  readonly loginBtn: Locator;
  readonly accessErrorText: Locator;
  readonly crashText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('nav, aside').first();
    // The sidebar is a plain <ul> (NOT a <nav>/<aside> landmark), so it is
    // identified as "the list that contains the Logout link" — unambiguous, and
    // it excludes body/stat-card links pointing at the same routes.
    this.sidebarList = page
      .getByRole('list')
      .filter({ has: page.getByRole('link', { name: /logout/i }) })
      .first();
    this.userEmail = page.getByText(/@/).first();
    // Sidebar links carry a leading icon glyph in their accessible name
    // (e.g. " Logout"), so these matchers are intentionally NOT anchored.
    this.logoutLink = page.getByRole('link', { name: /logout/i });
    this.dashboardLink = page.getByRole('link', { name: /dashboard/i }).first();
    this.loginBtn = page.getByRole('button', { name: /^log in$/i });
    this.accessErrorText = page
      .getByText(/403|forbidden|access denied|unauthori[sz]ed|not found|no permission/i)
      .first();
    this.crashText = page
      .getByText(/something went wrong|application error|cannot read propert|undefined is not/i)
      .first();
  }

  /** Navigate to an app path relative to baseURL. */
  async goto(path: string): Promise<this> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    return this;
  }

  /** Resolve once the authenticated app shell (sidebar) is present. */
  async expectShellReady(): Promise<this> {
    await expect(this.page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    return this;
  }

  /** Click a sidebar nav item by visible name. */
  async navTo(name: keyof typeof ROUTES): Promise<this> {
    await this.page
      .getByRole('link', { name: new RegExp(name, 'i') })
      .first()
      .click();
    await this.page.waitForLoadState('domcontentloaded');
    return this;
  }

  /** The shared destructive-confirm dialog ("Continue" / "Yes" / "Delete"). */
  async confirmDestructive(): Promise<boolean> {
    const confirm = this.page
      .getByRole('button', { name: /^(continue|yes|confirm|delete)$/i })
      .last();
    if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirm.click();
      return true;
    }
    return false;
  }

  async logout(): Promise<void> {
    await this.logoutLink.click();
    await this.page.waitForURL(/\/$/, { timeout: 15_000 }).catch(() => {});
  }

  // ── Authentication state ───────────────────────────────────────────────────

  /** True while no login form is on screen, i.e. the session still holds. */
  async isLoggedOut(): Promise<boolean> {
    return (await this.loginBtn.count()) > 0;
  }

  /** Assert the authenticated shell is rendered (not bounced to login). */
  async expectAuthenticated(timeout = 15_000): Promise<this> {
    await expect(this.dashboardLink).toBeVisible({ timeout });
    return this;
  }

  /** Assert the app bounced this navigation back to the login screen. */
  async expectRedirectedToLogin(path: string, timeout = 15_000): Promise<this> {
    await this.goto(path);
    await expect(this.loginBtn).toBeVisible({ timeout });
    return this;
  }

  /** Clear cookies + web storage so no stale session leaks into the next login. */
  async clearSession(): Promise<this> {
    await this.page.context().clearCookies();
    await this.goto('/');
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    return this;
  }

  // ── Authorization / error surfaces ─────────────────────────────────────────

  /**
   * Settle after a client-side route guard has had a chance to decide.
   * DEBT: networkidle is a timing proxy, not the guard's own signal. Replacing
   * it needs a live run with a restricted-role account; centralised here so the
   * fix lands in one place instead of in every RBAC spec.
   */
  async settleAfterGuard(): Promise<this> {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    return this;
  }

  /** True when a 403 / access-denied / not-found surface is shown. */
  async hasAccessError(): Promise<boolean> {
    return this.accessErrorText.isVisible().catch(() => false);
  }

  /** True when an error boundary / uncaught-error message blew up the page. */
  async hasCrashed(): Promise<boolean> {
    return this.crashText.isVisible().catch(() => false);
  }

  /**
   * True when the current URL is no longer on `path` — redirected away, bounced
   * to login, or dropped back to root. One half of the "route is fenced" check.
   */
  redirectedAwayFrom(path: string): boolean {
    const url = this.page.url();
    return !url.includes(path) || /login|signin/i.test(url) || new URL(url).pathname === '/';
  }

  /**
   * A restricted route must be redirected away OR show an access error. Both
   * failing means the protected screen leaked — a real authorization defect.
   */
  async expectRouteFenced(path: string): Promise<this> {
    await this.goto(path);
    await this.settleAfterGuard();
    const fenced = this.redirectedAwayFrom(path) || (await this.hasAccessError());
    expect(
      fenced,
      `${path} must be redirected or show an access error for a restricted user`,
    ).toBeTruthy();
    return this;
  }

  /**
   * Navigate to `path` while recording which API paths answer 403.
   *
   * Some modules render an empty shell instead of a 403 page when a permission
   * is revoked, so "is the user fenced out?" cannot be answered from the DOM
   * alone — the data call's status is the stricter signal.
   */
  async gotoRecordingForbidden(path: string): Promise<string[]> {
    const forbidden = new Set<string>();
    const onResponse = (r: import('@playwright/test').Response): void => {
      if (r.status() === 403) forbidden.add(new URL(r.url()).pathname);
    };
    this.page.on('response', onResponse);
    try {
      await this.goto(path);
      await this.settleAfterGuard();
      // Give late XHRs a beat to resolve so their status is observed.
      await this.page.waitForTimeout(1_500);
    } finally {
      this.page.off('response', onResponse);
    }
    return [...forbidden];
  }

  // ── Action controls ────────────────────────────────────────────────────────

  /** An action control by accessible name, whether rendered as a button or link. */
  actionControl(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name }).or(this.page.getByRole('link', { name }));
  }

  /**
   * Edge case: a withheld action may be removed from the DOM (hidden) OR
   * rendered but inert (disabled). Both pass; visible-AND-enabled is the defect.
   */
  async expectActionHiddenOrDisabled(name: string | RegExp): Promise<this> {
    const control = this.actionControl(name);
    if ((await control.count()) === 0) return this; // hidden — acceptable
    await expect(
      control.first(),
      `"${name}" is present but must be disabled for a restricted user`,
    ).toBeDisabled();
    return this;
  }

  /** A sidebar nav link by visible label (icon glyphs make it un-anchored). */
  navLink(label: string | RegExp): Locator {
    return this.sidebarList.getByRole('link', { name: label }).first();
  }

  // ── Dialogs ────────────────────────────────────────────────────────────────

  /**
   * Start capturing native JS dialogs and return a probe reporting whether one
   * fired. Used by the injection cases: a payload that reaches alert()/confirm()
   * proves it was evaluated rather than escaped. Dialogs are dismissed on sight
   * so an unhandled modal can never freeze the rest of the test.
   */
  watchDialogs(): () => boolean {
    let fired = false;
    this.page.on('dialog', async (dialog) => {
      fired = true;
      await dialog.dismiss().catch(() => {});
    });
    return () => fired;
  }

  // ── Network ────────────────────────────────────────────────────────────────

  /**
   * Start recording request URLs matching `pattern` and return the (growing)
   * list. Attach BEFORE the interaction under test, then assert on the array.
   * Used by the API-contract cases that check which query a UI action issues.
   */
  recordRequests(pattern: RegExp): string[] {
    const urls: string[] = [];
    this.page.on('request', (r) => {
      if (pattern.test(r.url())) urls.push(r.url());
    });
    return urls;
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  /** True when the document scrolls horizontally at the current viewport. */
  async hasHorizontalOverflow(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    );
  }
}

export default BasePage;
