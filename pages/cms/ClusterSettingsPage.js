// =============================================================================
//  ClusterSettingsPage — /cluster-settings/{clusterId}
//
//  Three sources of truth, and they are not interchangeable:
//
//   1. GET /v3/cms/cluster/read/{id} — the persisted cluster:
//        isScreenSync : boolean         the Sync toggle
//        manageMode   : 'playlist'|'files'
//        batches[]    : { id, name, width, height, screens[], playlist }
//        screens[]    : { id, name, status, orientation, playlist[] }
//      `status` is the screen's online flag (the green dot on the card).
//      Master identity is NOT here.
//
//   2. The socket.io live channel — master election (`clusterScreens`) and
//      per-screen playback telemetry (`playlistEvent`). See helpers/clusterMonitor.js.
//      This is the only publisher of the master, so the monitor is attached in
//      the constructor: the message is sent on connect, and a page.reload()
//      tears the socket down and re-handshakes.
//
//   3. The DOM — the 👑 and the status dot, both painted from (2). Useful as a
//      cross-check that the UI agrees with the live channel, never as the
//      primary signal: the crown paints a beat after first render.
//
//  Header buttons carry their state in the label ("Sync On" / "Sync Off"), and
//  their Bootstrap icon glyph leaks into the accessible name — hence the
//  unanchored name patterns below.
// =============================================================================

import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { attachClusterMonitor } from '../../helpers/clusterMonitor.js';

/** Card footer label for one screen: "👑 ● benQ 2". */
const CARD_LABEL = 'div[title]';
const STATUS_DOT = 'span[style*="border-radius: 50%"]';

export class ClusterSettingsPage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} clusterId
   */
  constructor(page, clusterId) {
    super(page);
    this.clusterId = clusterId;

    // Attach before any navigation — clusterScreens is sent once, on connect.
    this.live = attachClusterMonitor(page, clusterId);

    this._clusterDoc = null;
    page.on('response', async (res) => {
      if (!res.url().includes(`/cluster/read/${clusterId}`)) return;
      try {
        this._clusterDoc = (await res.json()).cluster;
      } catch { /* non-JSON / aborted */ }
    });

    const header = page.locator('.card', { has: page.getByRole('button', { name: /save & sync/i }) }).first();
    this.header = header;
    this.restartClusterBtn = header.getByRole('button', { name: /restart screens/i });
    this.liveDataBtn = header.getByRole('button', { name: /live data (on|off)/i });
    this.syncBtn = header.getByRole('button', { name: /sync (on|off)/i });
    this.filesModeBtn = header.getByRole('button', { name: /files/i });
    this.playlistModeBtn = header.getByRole('button', { name: /playlist/i });
    this.saveSyncBtn = header.getByRole('button', { name: /save & sync/i });

    this.addBatchBtn = page.getByRole('button', { name: /add batch/i });
    this.manageScreensBtn = page.getByRole('button', { name: /manage screens/i });
    this.managePlaylistLink = page.getByRole('link', { name: /manage playlist/i });
  }

  async open() {
    await this.goto(`/cluster-settings/${this.clusterId}`, 'domcontentloaded');
    await this.saveSyncBtn.waitFor({ state: 'visible', timeout: 30_000 });
    // Screen cards hydrate once the cluster payload lands.
    await this.screenCards().first().waitFor({ state: 'visible', timeout: 30_000 });
    return this;
  }

  // ── Persisted state (API) ─────────────────────────────────────────────────

  /** The cluster document the page is rendering, as the app received it. */
  async fetchCluster({ timeout = 20_000 } = {}) {
    const deadline = Date.now() + timeout;
    while (!this._clusterDoc && Date.now() < deadline) await this.page.waitForTimeout(250);
    expect(this._clusterDoc, 'the page never received a cluster/read payload').toBeTruthy();
    return this._clusterDoc;
  }

  /** All screens across every batch: { id, name, status }. */
  async screens() {
    return (await this.fetchCluster()).batches.flatMap((b) => b.screens);
  }

  async screenNameById(id) {
    return (await this.screens()).find((s) => s.id === id)?.name ?? id;
  }

  // ── Master (live channel) ─────────────────────────────────────────────────

  /**
   * Name of the elected master, waiting for the live channel to publish it.
   * Throws if no master is announced inside the window — a masterless cluster
   * with screens online is a defect, not a timing artefact.
   */
  async masterName({ timeoutMs = 60_000 } = {}) {
    await this.live.waitForMaster({ timeoutMs });
    return this.screenNameById(this.live.masterScreenId);
  }

  async slaveNames(opts) {
    const master = await this.masterName(opts);
    return (await this.screens()).map((s) => s.name).filter((n) => n !== master);
  }

  // ── Rendered state (DOM) ──────────────────────────────────────────────────

  /** One locator per screen card footer, in render order. */
  screenCards() {
    return this.page.locator(CARD_LABEL).filter({ has: this.page.locator(STATUS_DOT) });
  }

  /**
   * What the page is showing per screen: { name, isMaster, online }.
   * `online` is the green/grey dot, `isMaster` the crown.
   */
  async screenStates() {
    return this.screenCards().evaluateAll((cards) =>
      cards.map((c) => {
        const dot = c.querySelector('span[style*="border-radius: 50%"]');
        return {
          name: c.getAttribute('title'),
          isMaster: c.textContent.includes('\u{1F451}'),
          online: !!dot && dot.className.includes('bg-success'),
        };
      })
    );
  }

  /** Label state of the header toggles, e.g. { sync: 'Sync On', liveData: 'Live Data On' }. */
  async toggleLabels() {
    const read = async (loc) => (await loc.textContent()).trim().replace(/\s+/g, ' ');
    return {
      sync: await read(this.syncBtn),
      liveData: await read(this.liveDataBtn),
    };
  }

  /**
   * Poll the rendered cluster until `predicate(states)` holds.
   *
   * Polls in place by default: a reload drops the socket, and the crown and the
   * status dots are painted from it. Pass `reload: true` only when you need a
   * fresh cluster/read (the online flags are server-rendered on load), and
   * accept that each reload costs the live channel a re-handshake.
   *
   * @returns {Promise<{states: object[], elapsedMs: number}>}
   */
  async waitForScreenState(predicate, { timeoutMs = 120_000, pollMs = 3_000, reload = false } = {}) {
    const started = Date.now();
    for (;;) {
      const states = await this.screenStates();
      if (predicate(states)) return { states, elapsedMs: Date.now() - started };
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Cluster never reached the expected state within ${timeoutMs} ms. Last seen: ${JSON.stringify(states)}`
        );
      }
      await this.page.waitForTimeout(pollMs);
      if (reload) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.screenCards().first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
      }
    }
  }
}

export default ClusterSettingsPage;
