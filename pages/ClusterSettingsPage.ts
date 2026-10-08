// =============================================================================
//  ClusterSettingsPage — /cluster-settings/{clusterId}
//
//  Complements ClustersPage: that one owns the /clusters listing, the content-
//  mode toggle and batches. This one owns what makes a cluster a cluster —
//  master election, per-screen online state and the live playback channel.
//
//  Three sources of truth, and they are not interchangeable:
//
//   1. GET /v3/cms/cluster/read/{id} — the persisted cluster:
//        isScreenSync : boolean         the Sync toggle
//        manageMode   : 'playlist'|'files'
//        batches[]    : { id, name, width, height, screens[], playlist }
//      `status` is the screen's online flag (the green dot on the card).
//      Master identity is NOT here.
//
//   2. The socket.io live channel — master election (`clusterScreens`) and
//      per-screen playback telemetry (`playlistEvent`). See
//      helpers/cluster/clusterMonitor.ts. This is the only publisher of the
//      master, so the monitor is attached in the constructor: the message is
//      sent on connect, and a page.reload() tears the socket down.
//
//   3. The DOM — the 👑 and the status dot, both painted from (2). Useful as a
//      cross-check that the UI agrees with the live channel, never as the
//      primary signal: the crown paints a beat after first render.
//
//  Header buttons carry their state in the label ("Sync On" / "Sync Off"), and
//  their icon glyph leaks into the accessible name — hence the unanchored name
//  patterns below, the same convention BasePage documents for the sidebar.
// =============================================================================

import { type Locator, type Page, type Response, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { attachClusterMonitor, type ClusterMonitor } from '../helpers/cluster/clusterMonitor';

/** Card footer label for one screen: "👑 ● benQ 2". */
const CARD_LABEL = 'div[title]';
const STATUS_DOT = 'span[style*="border-radius: 50%"]';

/** One frame of a screen's preview playlist, as cluster/read carries it. */
export interface ClusterPreviewFrame {
  zones?: { img?: string }[];
}

export interface ClusterScreen {
  id: string;
  name: string;
  /** Online flag — the green dot on the card. */
  status: boolean;
  orientation?: string;
  playlist?: ClusterPreviewFrame[];
}

export interface ClusterBatch {
  id: string;
  name: string;
  width: number;
  height: number;
  screens: ClusterScreen[];
  playlist?: unknown;
}

export interface ClusterDoc {
  id: string;
  isScreenSync: boolean;
  manageMode: 'playlist' | 'files';
  batches: ClusterBatch[];
}

/** What the page is showing for one screen card. */
export interface ScreenState {
  name: string;
  isMaster: boolean;
  online: boolean;
}

export interface WaitForScreenStateOptions {
  timeoutMs?: number;
  pollMs?: number;
  /**
   * Reload between polls. Costs the live channel a re-handshake, so it is off by
   * default — only the server-rendered online flags need it.
   */
  reload?: boolean;
}

export class ClusterSettingsPage extends BasePage {
  readonly clusterId: string;
  readonly live: ClusterMonitor;

  readonly header: Locator;
  readonly restartClusterBtn: Locator;
  readonly liveDataBtn: Locator;
  readonly syncBtn: Locator;
  readonly filesModeBtn: Locator;
  readonly playlistModeBtn: Locator;
  readonly saveSyncBtn: Locator;
  readonly addBatchBtn: Locator;
  readonly manageScreensBtn: Locator;
  readonly managePlaylistLink: Locator;

  private clusterDoc: ClusterDoc | null = null;

  constructor(page: Page, clusterId: string) {
    super(page);
    this.clusterId = clusterId;

    // Attach before any navigation — clusterScreens is sent once, on connect.
    this.live = attachClusterMonitor(page, clusterId);

    page.on('response', (res: Response) => {
      if (!res.url().includes(`/cluster/read/${clusterId}`)) return;
      void res
        .json()
        .then((body: { cluster?: ClusterDoc }) => {
          if (body?.cluster) this.clusterDoc = body.cluster;
        })
        .catch(() => {
          /* non-JSON / aborted */
        });
    });

    const header = page
      .locator('.card', { has: page.getByRole('button', { name: /save & sync/i }) })
      .first();
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

  async open(): Promise<this> {
    await this.goto(`/cluster-settings/${this.clusterId}`);
    await this.saveSyncBtn.waitFor({ state: 'visible', timeout: 30_000 });
    // Screen cards hydrate once the cluster payload lands.
    await this.screenCards().first().waitFor({ state: 'visible', timeout: 30_000 });
    return this;
  }

  // ── Persisted state (API) ──────────────────────────────────────────────────

  /** The cluster document the page is rendering, as the app received it. */
  async fetchCluster({ timeoutMs = 20_000 }: { timeoutMs?: number } = {}): Promise<ClusterDoc> {
    const deadline = Date.now() + timeoutMs;
    while (!this.clusterDoc && Date.now() < deadline) {
      await this.page.waitForTimeout(250);
    }
    const doc = this.clusterDoc;
    expect(doc, 'the page never received a cluster/read payload').toBeTruthy();
    return doc as ClusterDoc;
  }

  /** All screens across every batch. */
  async screens(): Promise<ClusterScreen[]> {
    return (await this.fetchCluster()).batches.flatMap((b) => b.screens);
  }

  async screenNameById(id: string | null): Promise<string> {
    if (!id) return 'none';
    return (await this.screens()).find((s) => s.id === id)?.name ?? id;
  }

  // ── Master (live channel) ──────────────────────────────────────────────────

  /**
   * Name of the elected master, waiting for the live channel to publish it.
   * Throws if no master is announced inside the window — a masterless cluster
   * with screens online is a defect, not a timing artefact.
   */
  async masterName({ timeoutMs = 60_000 }: { timeoutMs?: number } = {}): Promise<string> {
    await this.live.waitForMaster({ timeoutMs });
    return this.screenNameById(this.live.masterScreenId);
  }

  async slaveNames(opts: { timeoutMs?: number } = {}): Promise<string[]> {
    const master = await this.masterName(opts);
    return (await this.screens()).map((s) => s.name).filter((n) => n !== master);
  }

  // ── Rendered state (DOM) ───────────────────────────────────────────────────

  /** One locator per screen card footer, in render order. */
  screenCards(): Locator {
    return this.page.locator(CARD_LABEL).filter({ has: this.page.locator(STATUS_DOT) });
  }

  /** What the page is showing per screen: the crown and the green/grey dot. */
  async screenStates(): Promise<ScreenState[]> {
    return this.screenCards().evaluateAll((cards) =>
      cards.map((c) => {
        const dot = c.querySelector('span[style*="border-radius: 50%"]');
        return {
          name: c.getAttribute('title') ?? '',
          isMaster: (c.textContent ?? '').includes('\u{1F451}'),
          online: !!dot && (dot.getAttribute('class') ?? '').includes('bg-success'),
        };
      }),
    );
  }

  /** Label state of the header toggles, e.g. { sync: 'Sync On' }. */
  async toggleLabels(): Promise<{ sync: string; liveData: string }> {
    const read = async (loc: Locator): Promise<string> =>
      ((await loc.textContent()) ?? '').trim().replace(/\s+/g, ' ');
    return {
      sync: await read(this.syncBtn),
      liveData: await read(this.liveDataBtn),
    };
  }

  /**
   * Poll the rendered cluster until `predicate(states)` holds.
   *
   * Polls in place by default: a reload drops the socket, and the crown and the
   * status dots are painted from it. Pass `reload: true` only when a fresh
   * cluster/read is needed (the online flags are server-rendered on load), and
   * accept that each reload costs the live channel a re-handshake.
   */
  async waitForScreenState(
    predicate: (states: ScreenState[]) => boolean,
    { timeoutMs = 120_000, pollMs = 3_000, reload = false }: WaitForScreenStateOptions = {},
  ): Promise<{ states: ScreenState[]; elapsedMs: number }> {
    const started = Date.now();
    for (;;) {
      const states = await this.screenStates();
      if (predicate(states)) return { states, elapsedMs: Date.now() - started };
      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Cluster never reached the expected state within ${timeoutMs} ms. ` +
            `Last seen: ${JSON.stringify(states)}`,
        );
      }
      await this.page.waitForTimeout(pollMs);
      if (reload) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.screenCards()
          .first()
          .waitFor({ state: 'visible', timeout: 30_000 })
          .catch(() => {
            /* the cards may be mid-hydration; the next poll re-reads */
          });
      }
    }
  }
}

export default ClusterSettingsPage;
