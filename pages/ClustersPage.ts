// =============================================================================
//  ClustersPage — screen clusters at /clusters, plus the two surfaces below it.
//  Selectors verified live against cms2.pocsample.in (2026-07-30).
//
//  ── The model, as the build actually implements it ──────────────────────────
//  A cluster is not a content holder. It is a named set of BATCHES; a batch is a
//  set of screens plus the content assigned to them. Three surfaces:
//
//    /clusters                    listing — one <table> row per cluster, with a
//                                 screen count and a link to its settings
//    /cluster-settings/<id>       the cluster: a Files|Playlist content-mode
//                                 toggle that applies to the whole cluster, and
//                                 one card per batch
//    /batch-settings/<batchId>    the batch: assigns content to its screens. In
//                                 Playlist mode this is a list of playlists to
//                                 pick from
//
//  Two things worth knowing before writing against this:
//
//   • The content-mode toggle offers exactly Files and Playlist. There is no
//     campaign mode and no campaign picker anywhere below a cluster, so a campaign
//     reaches cluster screens only INDIRECTLY, through a playlist that contains
//     it. See tests/cms2/campaigns/cluster/.
//   • Every button and link on these pages carries a leading icon glyph in its
//     accessible name (" Manage Files", " Files"), so name matchers must NOT be
//     anchored — an anchored /^Files$/ silently matches nothing. This is the same
//     convention BasePage documents for the sidebar.
//   • "Manage Files" / "Manage Playlist" is a LINK, not a button — its label is
//     also the only place the UI states which mode the cluster is currently in.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** Which content kind a cluster's batches are assigned. */
export type ClusterContentMode = 'files' | 'playlist';

export class ClustersPage extends BasePage {
  readonly newClusterBtn: Locator;
  readonly table: Locator;
  readonly heading: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.newClusterBtn = page.getByRole('button', { name: /new cluster/i });
    this.table = page.getByRole('table').first();
    this.heading = page.getByText(/screen clusters/i).first();
  }

  // ── Listing ────────────────────────────────────────────────────────────────

  async open(): Promise<this> {
    await this.goto('/clusters');
    await this.expectShellReady();
    await expect(this.newClusterBtn).toBeVisible({ timeout: 20_000 });
    await this.expectListLoaded();
    return this;
  }

  rows(): Locator {
    return this.table.locator('tbody tr');
  }

  /**
   * Wait for the table to paint.
   *
   * The New Cluster button is part of the static toolbar and appears well before
   * /cluster/read resolves, so `open()` cannot use it as the ready signal for the
   * LIST. Reading rows or hrefs without this returns 0 and reads as "the account
   * has no clusters" — which then silently skips every test that needs one.
   *
   * Accepts an explicit empty state as loaded too: an account with no clusters is
   * legitimate, and must not hang here for 30 seconds before failing.
   */
  async expectListLoaded(): Promise<this> {
    const loaded = await expect
      .poll(async () => (await this.rows().count()) > 0, { timeout: 30_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      const empty = await this.page
        .getByText(/no (cluster|data|result)/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(empty, 'the clusters list shows rows or an explicit empty state').toBeTruthy();
    }
    return this;
  }

  /** "TOTAL SCREEN CLUSTERS - N" as the header reports it, or null if absent. */
  async totalFromHeader(): Promise<number | null> {
    const text = await this.page
      .getByText(/total screen clusters/i)
      .first()
      .textContent()
      .catch(() => null);
    const m = text?.match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  /** Every cluster id on the listing, read off the settings links. */
  async clusterIds(): Promise<string[]> {
    const hrefs = await this.page
      .locator('a[href^="/cluster-settings/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    return [...new Set(hrefs.map((h) => h.split('/').pop() ?? '').filter(Boolean))];
  }

  // ── A single cluster ───────────────────────────────────────────────────────

  async openCluster(id: string): Promise<this> {
    await this.goto(`/cluster-settings/${id}`);
    await this.expectShellReady();
    return this;
  }

  /**
   * The Files | Playlist toggle. Deliberately matched by its own class rather
   * than by role+name so a test can assert HOW MANY modes exist — the point of
   * the assertion is that Campaign is not among them.
   */
  contentModePills(): Locator {
    return this.page.locator('div[title*="Files Mode"] button, div[title*="Playlist Mode"] button');
  }

  /** Per-batch content link — "Manage Files" or "Manage Playlist". */
  manageLinks(): Locator {
    return this.page.getByRole('link', { name: /Manage (Files|Playlist)/i });
  }

  /**
   * Which mode the cluster is in, inferred from the batch link's label — the only
   * place the UI states it. Null when the cluster has no batches, since the label
   * is what carries the mode.
   */
  async contentMode(): Promise<ClusterContentMode | null> {
    const link = this.manageLinks().first();
    if (!(await link.isVisible().catch(() => false))) return null;
    return /Playlist/i.test(await link.innerText()) ? 'playlist' : 'files';
  }

  /** Wait until the batch cards have rendered. False when the cluster has none. */
  async hasBatches(timeout = 30_000): Promise<boolean> {
    return this.manageLinks()
      .first()
      .waitFor({ timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Switch the whole cluster between Files and Playlist mode.
   *
   * Mutates shared state — the mode is a property of the cluster, not of the
   * session — so callers must restore it. Confirmed to POST
   * /cluster/updateManageMode/<id>.
   */
  async setContentMode(mode: ClusterContentMode): Promise<this> {
    const word = mode === 'files' ? 'Files' : 'Playlist';
    const pill = this.contentModePills()
      .filter({ hasText: new RegExp(word) })
      .first();
    await pill.click({ timeout: 20_000 });

    // Wait on the MODE-SPECIFIC label. Waiting on `manageLinks()` instead would be
    // a no-op that always passes: its matcher accepts either label, so the wait
    // resolves against the pre-click state and the caller then reads a stale mode.
    await expect(
      this.page.getByRole('link', { name: new RegExp(`Manage ${word}`, 'i') }).first(),
      `the batch action must switch to Manage ${word}`,
    ).toBeVisible({ timeout: 30_000 });
    return this;
  }

  // ── A batch ────────────────────────────────────────────────────────────────

  /** Batch ids of the current cluster, read off the Manage links. */
  async batchIds(): Promise<string[]> {
    const hrefs = await this.manageLinks().evaluateAll((els) =>
      els.map((e) => e.getAttribute('href') ?? ''),
    );
    return hrefs.map((h) => h.split('/').pop() ?? '').filter(Boolean);
  }

  /**
   * Open a batch's content surface by CLICKING its link.
   *
   * Clicking is not a stylistic choice: /batch-settings/<id> is not addressable
   * by direct navigation — it redirects to /clusters — so `goto()` cannot reach
   * this page at all. See BUG-CLU-01.
   */
  async openFirstBatch(): Promise<this> {
    await this.manageLinks().first().click();
    await expect(this.page, 'clicking a batch action must land on its content surface').toHaveURL(
      /\/batch-settings\//,
      { timeout: 30_000 },
    );
    return this;
  }

  /** The playlist chooser on a batch content surface, in Playlist mode. */
  playlistCountLabel(): Locator {
    return this.page.getByText(/\d+\s+Playlists/i).first();
  }

  /** Any campaign-specific control. Expected to be absent everywhere. */
  campaignControls(): Locator {
    return this.page.getByRole('button', { name: /campaign/i });
  }
}

export default ClustersPage;
