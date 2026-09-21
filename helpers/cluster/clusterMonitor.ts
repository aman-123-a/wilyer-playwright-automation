// =============================================================================
//  clusterMonitor — taps the CMS live channel so cluster tests can assert on
//  what the screens are actually doing, not just on what the page renders.
//
//  The cluster-settings page opens a socket.io connection and receives two
//  message types:
//
//    clusterScreens  { clusterId, masterScreen, screensList }
//        Master election. `masterScreen` is a screen id and is the ONLY place
//        master identity is published — /cluster/read does not carry it, and the
//        👑 in the UI is drawn from this message. It arrives on connect and again
//        whenever the cluster re-elects.
//
//    playlistEvent   { screenId, data: { cs, fid, fn, fp, lid, lp, pid } }
//        Per-screen playback telemetry. `cs` is the state — PLAYING,
//        PLAY_COMPLETED, ASSIGNED_TO_RENDER, … — `fid` the file, `fp` its index
//        in the loop, `lid`/`lp` the loop. Two screens in step report the same
//        fid/lp at the same moment, so the arrival gap between their PLAYING
//        events is the observable sync skew.
//
//  Events carry no server timestamp, so we stamp them on arrival. Both screens
//  publish over the same socket to the same client, which keeps the comparison
//  fair: the skew measured is master-vs-slave, not client-vs-server.
//
//  The socket host is never hardcoded — the monitor listens to whatever socket
//  the page opens, so it follows TEST_ENV like everything else.
// =============================================================================

import type { Page } from '@playwright/test';

/** One playback telemetry report from a screen, stamped on arrival. */
export interface ClusterPlaybackEvent {
  readonly at: number;
  readonly screenId: string;
  readonly cs?: string;
  readonly fid?: string;
  readonly fn?: string;
  readonly fp?: number;
  readonly lid?: string;
  readonly lp?: number;
  readonly pid?: string;
}

/** A master election, as announced on the live channel. */
export interface MasterChange {
  readonly screenId: string | null;
  readonly at: number;
}

/** Two screens entering the same playback slot, and how far apart they were. */
export interface SkewPair {
  readonly slot: string;
  readonly fn?: string;
  readonly aAt: number;
  readonly bAt: number;
  readonly skewMs: number;
}

export interface WaitOptions {
  timeoutMs?: number;
  pollMs?: number;
  what?: string;
}

/** The `data` payload of a playlistEvent, as the CMS sends it. */
interface PlaybackData {
  cs?: string;
  fid?: string;
  fn?: string;
  fp?: number;
  lid?: string;
  lp?: number;
  pid?: string;
}

/** A decoded socket.io message frame, before we know which kind it is. */
interface LiveMessage {
  type?: string;
  clusterId?: string;
  masterScreen?: string | null;
  screenId?: string;
  data?: PlaybackData;
}

export class ClusterMonitor {
  /** Screen id currently elected master, or null before the first message. */
  masterScreenId: string | null = null;

  /** Every master change seen, in order. */
  readonly masterHistory: MasterChange[] = [];

  /** Playback telemetry, in arrival order. */
  readonly events: ClusterPlaybackEvent[] = [];

  private readonly page: Page;
  private readonly clusterId: string;

  /**
   * Attach to `page` BEFORE navigating — the master message is sent once, on
   * connect, and a page.reload() tears the socket down and re-handshakes.
   */
  constructor(page: Page, clusterId: string) {
    this.page = page;
    this.clusterId = clusterId;
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => this.onFrame(frame.payload));
    });
  }

  private onFrame(payload: string | Buffer): void {
    const raw = typeof payload === 'string' ? payload : payload.toString('utf8');
    // socket.io frames are "42[<event>,<data>]"; anything shorter is a heartbeat.
    if (raw.length < 4 || !raw.startsWith('42')) return;

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.slice(2));
    } catch {
      return; // not a JSON message frame
    }
    if (!Array.isArray(decoded) || decoded.length < 2) return;

    const msg = decoded[1] as LiveMessage | null;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'clusterScreens' && msg.clusterId === this.clusterId) {
      const elected = msg.masterScreen ?? null;
      if (elected !== this.masterScreenId) {
        this.masterScreenId = elected;
        this.masterHistory.push({ screenId: elected, at: Date.now() });
      }
      return;
    }

    if (msg.type === 'playlistEvent' && msg.screenId) {
      const d: PlaybackData = msg.data ?? {};
      this.events.push({
        at: Date.now(),
        screenId: msg.screenId,
        cs: d.cs,
        fid: d.fid,
        fn: d.fn,
        fp: d.fp,
        lid: d.lid,
        lp: d.lp,
        pid: d.pid,
      });
    }
  }

  // ── Waiting ────────────────────────────────────────────────────────────────

  /** Wait until `predicate` holds; resolves with the elapsed ms. */
  async waitFor(
    predicate: (monitor: this) => boolean,
    { timeoutMs = 60_000, pollMs = 500, what = 'condition' }: WaitOptions = {},
  ): Promise<number> {
    const started = Date.now();
    while (!predicate(this)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Live channel never reported ${what} within ${timeoutMs} ms`);
      }
      await this.page.waitForTimeout(pollMs);
    }
    return Date.now() - started;
  }

  /** Wait for the first master election message. */
  async waitForMaster(opts: WaitOptions = {}): Promise<number> {
    return this.waitFor((m) => !!m.masterScreenId, { what: 'a master screen', ...opts });
  }

  /** Wait for the master to change away from `previousId`. */
  async waitForMasterChange(previousId: string | null, opts: WaitOptions = {}): Promise<number> {
    return this.waitFor((m) => !!m.masterScreenId && m.masterScreenId !== previousId, {
      what: `a new master (was ${previousId ?? 'none'})`,
      ...opts,
    });
  }

  /** Wait until `screenId` has reported at least `count` events since now. */
  async waitForScreenEvents(screenId: string, count = 1, opts: WaitOptions = {}): Promise<number> {
    const from = this.events.length;
    return this.waitFor(
      (m) => m.events.slice(from).filter((e) => e.screenId === screenId).length >= count,
      { what: `${count} event(s) from screen ${screenId}`, ...opts },
    );
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /** Drop everything recorded so far — starts a clean measurement window. */
  reset(): this {
    this.events.length = 0;
    return this;
  }

  /** Events for one screen, optionally filtered to one playback state. */
  eventsFor(screenId: string, cs?: string): ClusterPlaybackEvent[] {
    return this.events.filter((e) => e.screenId === screenId && (!cs || e.cs === cs));
  }

  /**
   * Pair up the moments two screens entered the same playback state on the same
   * item, and report how far apart they were.
   *
   * A "slot" is one item in one loop pass: `${lid}:${lp}:${fid}:${fp}`. Screens
   * playing in step hit the same slot together, so the gap between their arrival
   * stamps is the sync skew for that item.
   */
  skewBetween(screenA: string, screenB: string, cs = 'PLAYING'): SkewPair[] {
    const slotKey = (e: ClusterPlaybackEvent): string => `${e.lid}:${e.lp}:${e.fid}:${e.fp}`;

    // Keep the FIRST report per slot — repeats are re-renders of the same item.
    const firstBySlot = (screenId: string): Map<string, ClusterPlaybackEvent> => {
      const out = new Map<string, ClusterPlaybackEvent>();
      for (const e of this.eventsFor(screenId, cs)) {
        if (!out.has(slotKey(e))) out.set(slotKey(e), e);
      }
      return out;
    };

    const a = firstBySlot(screenA);
    const b = firstBySlot(screenB);

    const paired: SkewPair[] = [];
    for (const [slot, ea] of a) {
      const eb = b.get(slot);
      if (!eb) continue;
      paired.push({ slot, fn: ea.fn, aAt: ea.at, bAt: eb.at, skewMs: Math.abs(ea.at - eb.at) });
    }
    return paired.sort((x, y) => x.aAt - y.aAt);
  }
}

/** Start recording live cluster traffic for `page`. Call BEFORE navigating. */
export function attachClusterMonitor(page: Page, clusterId: string): ClusterMonitor {
  return new ClusterMonitor(page, clusterId);
}

export default attachClusterMonitor;
