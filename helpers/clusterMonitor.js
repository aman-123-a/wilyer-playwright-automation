// =============================================================================
//  clusterMonitor — taps the CMS live channel so cluster tests can assert on
//  what the screens are actually doing, not just on what the page renders.
//
//  The cluster-settings page opens a socket.io connection to
//  wss://capi.wilyersignage.com and receives two message types:
//
//    clusterScreens  { clusterId, masterScreen, screensList }
//        Master election. `masterScreen` is a screen id and is the ONLY place
//        master identity is published — /cluster/read does not carry it, and
//        the 👑 in the UI is drawn from this message. It arrives on connect and
//        again whenever the cluster re-elects.
//
//    playlistEvent   { screenId, data: { cs, fid, fn, fp, ft, lid, lp, pid } }
//        Per-screen playback telemetry. `cs` is the state — PLAYING,
//        PLAY_COMPLETED, ASSIGNED_TO_RENDER, DISPLAY_CONDITION_PASSED,
//        NEW_LOOP_FILE_VALIDATION_START — `fid` the file, `fp` its index in the
//        loop, `lid`/`lp` the loop. Two screens in step report the same
//        fid/lp at the same moment, so the arrival gap between their PLAYING
//        events is the observable sync skew.
//
//  Events carry no server timestamp, so we stamp them on arrival. Both screens
//  publish over the same socket to the same client, which keeps the comparison
//  fair: the skew we measure is master-vs-slave, not client-vs-server.
// =============================================================================

/**
 * Start recording live cluster traffic for `page`. Call BEFORE navigating —
 * the master message is sent once on connect.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} clusterId  only messages for this cluster are kept
 */
export function attachClusterMonitor(page, clusterId) {
  const monitor = {
    /** Screen id currently elected master, or null before the first message. */
    masterScreenId: null,
    /** Every master change we saw: { screenId, at }. */
    masterHistory: [],
    /** Playback telemetry: { at, screenId, cs, fid, fp, lid, lp, pid, fn }. */
    events: [],
  };

  const onFrame = (payload) => {
    const raw = String(payload);
    // socket.io frames are "42[<event>,<data>]"; anything shorter is a heartbeat.
    if (raw.length < 4 || !raw.startsWith('42')) return;

    let msg;
    try {
      msg = JSON.parse(raw.slice(2))[1];
    } catch {
      return; // not a JSON message frame
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'clusterScreens' && msg.clusterId === clusterId) {
      if (msg.masterScreen !== monitor.masterScreenId) {
        monitor.masterScreenId = msg.masterScreen ?? null;
        monitor.masterHistory.push({ screenId: monitor.masterScreenId, at: Date.now() });
      }
      return;
    }

    if (msg.type === 'playlistEvent' && msg.screenId) {
      const d = msg.data || {};
      monitor.events.push({
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
  };

  page.on('websocket', (ws) => ws.on('framereceived', (f) => onFrame(f.payload)));

  /** Wait until `predicate(monitor)` holds; resolves with the elapsed ms. */
  monitor.waitFor = async (predicate, { timeoutMs = 60_000, pollMs = 500, what = 'condition' } = {}) => {
    const started = Date.now();
    while (!predicate(monitor)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Live channel never reported ${what} within ${timeoutMs} ms`);
      }
      await page.waitForTimeout(pollMs);
    }
    return Date.now() - started;
  };

  /** Wait for the first master election message. */
  monitor.waitForMaster = (opts = {}) =>
    monitor.waitFor((m) => !!m.masterScreenId, { what: 'a master screen', ...opts });

  /** Wait for the master to change away from `previousId`. */
  monitor.waitForMasterChange = (previousId, opts = {}) =>
    monitor.waitFor((m) => !!m.masterScreenId && m.masterScreenId !== previousId, {
      what: `a new master (was ${previousId})`,
      ...opts,
    });

  /** Wait until `screenId` has reported at least `count` events since now. */
  monitor.waitForScreenEvents = (screenId, count = 1, opts = {}) => {
    const from = monitor.events.length;
    return monitor.waitFor(
      (m) => m.events.slice(from).filter((e) => e.screenId === screenId).length >= count,
      { what: `${count} event(s) from screen ${screenId}`, ...opts }
    );
  };

  /** Drop everything recorded so far — use to start a clean measurement window. */
  monitor.reset = () => {
    monitor.events.length = 0;
    return monitor;
  };

  /** Events for one screen, optionally filtered to one playback state. */
  monitor.eventsFor = (screenId, cs) =>
    monitor.events.filter((e) => e.screenId === screenId && (!cs || e.cs === cs));

  /**
   * Pair up the moments two screens entered the same playback state on the same
   * item, and report how far apart they were.
   *
   * A "slot" is one item in one loop pass: `${lid}:${lp}:${fid}:${fp}`. Screens
   * playing in step hit the same slot together, so the gap between their
   * arrival stamps is the sync skew for that item.
   *
   * @returns {{ slot: string, fn: string, aAt: number, bAt: number, skewMs: number }[]}
   */
  monitor.skewBetween = (screenA, screenB, cs = 'PLAYING') => {
    const slotKey = (e) => `${e.lid}:${e.lp}:${e.fid}:${e.fp}`;
    // Keep the FIRST report per slot — repeats are re-renders of the same item.
    const firstBySlot = (screenId) => {
      const out = new Map();
      for (const e of monitor.eventsFor(screenId, cs)) {
        if (!out.has(slotKey(e))) out.set(slotKey(e), e);
      }
      return out;
    };

    const a = firstBySlot(screenA);
    const b = firstBySlot(screenB);

    const paired = [];
    for (const [slot, ea] of a) {
      const eb = b.get(slot);
      if (!eb) continue;
      paired.push({ slot, fn: ea.fn, aAt: ea.at, bAt: eb.at, skewMs: Math.abs(ea.at - eb.at) });
    }
    return paired.sort((x, y) => x.aAt - y.aAt);
  };

  return monitor;
}

export default attachClusterMonitor;
