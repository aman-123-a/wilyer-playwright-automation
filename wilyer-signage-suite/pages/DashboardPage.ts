// =============================================================================
//  DashboardPage — statistic cards, quick actions, charts, map, license banners.
// =============================================================================
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { ROUTES } from '../config/routes';

export class DashboardPage extends BasePage {
  readonly statCards: Locator;
  readonly quickActions: Locator;
  readonly charts: Locator;
  readonly map: Locator;
  readonly licenseBanner: Locator;

  /** Known stat-card labels on this CMS dashboard (text-based, markup-agnostic). */
  static readonly STAT_LABELS =
    /online screens|offline screens|total screens|total media|storage used|available licen|licen[cs]es expiring/i;

  constructor(page: Page) {
    super(page);
    // Stat cards render number + UPPERCASE label as text; target the labels.
    this.statCards = page
      .locator('div, section, article, a')
      .filter({ hasText: DashboardPage.STAT_LABELS });
    this.quickActions = page
      .getByRole('button', { name: /new screen|add media|new playlist|new group|create|upload/i })
      .or(page.getByRole('link', { name: /new screen|add media|new playlist|new group/i }));
    // Visible-filtered: the dashboard has dozens of inline nav-icon SVGs; an
    // unfiltered `.first()` can resolve to a hidden one. Restrict to on-screen
    // data visuals (chart canvas/svg or the data tables).
    this.charts = page
      .locator('canvas, svg[class*="apexcharts" i], svg[class*="recharts" i], [class*="chart" i], .apexcharts-canvas, table')
      .filter({ visible: true });
    this.map = page.locator('[class*="leaflet" i], [class*="map" i], canvas[class*="map" i], iframe[src*="map" i]');
    this.licenseBanner = page
      .locator('div, section, [role="alert"], [class*="banner" i], [class*="alert" i]')
      .filter({ hasText: /licen[cs]e|expir/i });
  }

  async open(): Promise<void> {
    await this.goto(ROUTES.dashboard);
    await expect(this.page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 20_000 });
  }

  async expectStatsLoaded(min = 1): Promise<void> {
    await expect(this.statCards.first()).toBeVisible({ timeout: 20_000 });
    expect(await this.statCards.count()).toBeGreaterThanOrEqual(min);
  }

  async expectChartsRendered(): Promise<void> {
    await expect(this.charts.first()).toBeVisible({ timeout: 20_000 });
  }

  async expectMapLoaded(): Promise<void> {
    await expect(this.map.first()).toBeVisible({ timeout: 20_000 });
  }

  async hasExpiredBanner(): Promise<boolean> {
    return this.licenseBanner.filter({ hasText: /expired/i }).first().isVisible().catch(() => false);
  }

  async hasExpiringBanner(): Promise<boolean> {
    return this.licenseBanner.filter({ hasText: /expir(es|ing)|will expire|days left/i }).first().isVisible().catch(() => false);
  }
}
