// =============================================================================
//  Campaigns V1 — CLUSTER INTEGRATION SMOKE (CLU-001…005, covering CP-PLC-012…016).
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── The headline finding ────────────────────────────────────────────────────
//  The test plan (docs/qa-reports/campaigns-v1-rbac/20-…) specifies CP-PLC-012
//  "Add a campaign to a cluster … accepted with the same flow and validation as a
//  playlist", and CP-PLC-013 asserts cluster/playlist PARITY on the strength of
//  the PRD line "the same functionality as playlists".
//
//  That is not what this build does. Mapped live 2026-07-30 across all three
//  cluster surfaces (/clusters, /cluster-settings/<id>, /batch-settings/<id>):
//  a cluster's content mode is Files or Playlist, and there is no campaign mode,
//  no campaign tab and no campaign picker anywhere beneath a cluster. A campaign
//  reaches cluster screens only INDIRECTLY — by being inside a playlist that is
//  then assigned to a batch.
//
//  So these tests do not attempt CP-PLC-012 as written; a spec that dragged a
//  campaign onto a cluster would fail on a control that does not exist, which
//  reports a missing feature as a broken one. Instead they PIN the actual content
//  model, so that the day a campaign mode is added, CLU-003 fails and this file
//  gets rewritten deliberately rather than the gap going unnoticed.
//
//  CP-PLC-014 (edit fans out to every screen in the cluster) and CP-PLC-016
//  (mixed cluster) both require observing playback on physical screens. Every
//  screen on this account reads "Screen Disconnected", so neither is automatable
//  here and neither is stubbed — see docs/known-gaps.md.
//
//  ── Read-only by design ─────────────────────────────────────────────────────
//  cms2 is shared, and a cluster's content mode is a property of the CLUSTER, not
//  of the session: flipping it changes what a colleague's screens play. The one
//  test that must toggle it (CLU-003) restores the original mode in a finally,
//  and nothing here ever presses Save Changes on a batch.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import type { ClustersPage } from '../../../../pages/ClustersPage';

/**
 * The first cluster on the listing that actually has a batch.
 *
 * Cluster ids are not fixed test data — they are whatever exists on the shared
 * account — so they are discovered rather than hardcoded. Most clusters on cms2
 * hold zero screens and zero batches, and the content surfaces only exist below a
 * batch, so a spec pinned to "the first cluster" would skip or fail at random as
 * colleagues add and remove clusters.
 */
async function firstClusterWithBatch(
  clusters: ClustersPage,
  limit = 6,
): Promise<{ id: string } | null> {
  await clusters.open();
  const ids = await clusters.clusterIds();
  for (const id of ids.slice(0, limit)) {
    await clusters.openCluster(id);
    if (await clusters.hasBatches(15_000)) return { id };
  }
  return null;
}

test.describe('Campaigns · cluster integration', () => {
  /**
   * Serial, deliberately. CLU-003 flips the cluster's content mode, and that mode
   * is shared state on a shared server — run in parallel, it changes underneath
   * CLU-004's persistence check and fails it for a reason that has nothing to do
   * with the product. Five short read-mostly tests do not need the parallelism.
   */
  test.describe.configure({ mode: 'serial' });

  test('CLU-001 · the clusters listing renders every cluster it reports @smoke @ui', async ({
    clustersPage,
  }) => {
    test.setTimeout(120_000);
    await clustersPage.open();

    const total = await clustersPage.totalFromHeader();
    expect(total, 'the listing must state a cluster total').not.toBeNull();

    // The header count and the rows have to agree. They disagree when the table
    // paginates but the header does not, which is how an operator ends up
    // believing a cluster was deleted.
    const rows = await clustersPage.rows().count();
    expect(rows, 'the listing must render rows for the clusters it counts').toBeGreaterThan(0);
    expect(
      rows,
      `header says ${total} clusters but ${rows} rows rendered — the two must not drift apart`,
    ).toBe(total);

    // Every row must offer a way in, or the cluster is unreachable.
    expect(
      (await clustersPage.clusterIds()).length,
      'every cluster row must link to its settings',
    ).toBe(rows);
  });

  test('CLU-002 · a cluster exposes exactly two content modes, and neither is Campaign @smoke @critical @ui', async ({
    clustersPage,
  }) => {
    test.setTimeout(180_000);
    const cluster = await firstClusterWithBatch(clustersPage);
    test.skip(!cluster, 'No cluster on this account has a batch, so it has no content surface.');

    // This is the assertion that encodes the CP-PLC-012 gap. It is written as
    // "exactly two modes, Files and Playlist" rather than "no campaign mode"
    // because the former also fails if a THIRD mode appears under any name.
    const pills = clustersPage.contentModePills();
    await expect(pills, 'the content-mode toggle must be present').not.toHaveCount(0);

    const labels = (await pills.allInnerTexts()).map((t) => t.trim().toLowerCase());
    expect(
      labels.length,
      `a cluster offers Files or Playlist and nothing else — saw ${JSON.stringify(labels)}`,
    ).toBe(2);
    expect(
      labels.some((l) => l.includes('files')),
      'Files mode must be offered',
    ).toBe(true);
    expect(
      labels.some((l) => l.includes('playlist')),
      'Playlist mode must be offered',
    ).toBe(true);
    expect(
      labels.some((l) => l.includes('campaign')),
      'there is no campaign content mode on a cluster — if this now fails, the feature has ' +
        'landed and CP-PLC-012/013 must be automated for real',
    ).toBe(false);

    await expect(
      clustersPage.campaignControls(),
      'and no campaign control anywhere on the cluster surface',
    ).toHaveCount(0);
  });

  test('CLU-003 · a batch assigns playlists, never campaigns directly @critical @ui', async ({
    clustersPage,
  }) => {
    test.setTimeout(240_000);
    const cluster = await firstClusterWithBatch(clustersPage);
    test.skip(!cluster, 'No cluster on this account has a batch, so it has no content surface.');

    const original = await clustersPage.contentMode();
    expect(original, 'the batch action label must state the current mode').not.toBeNull();

    try {
      // Playlist mode is the only mode in which a campaign could reach a cluster
      // at all, so it is the one worth inspecting.
      if (original !== 'playlist') await clustersPage.setContentMode('playlist');
      expect(await clustersPage.contentMode(), 'the cluster must now be in Playlist mode').toBe(
        'playlist',
      );

      await clustersPage.openFirstBatch();

      // What the batch offers is a list of PLAYLISTS to assign…
      await expect(
        clustersPage.playlistCountLabel(),
        'a batch in Playlist mode must offer playlists to assign',
      ).toBeVisible({ timeout: 30_000 });

      // …and nothing campaign-shaped. The playlist editor reaches campaigns via a
      // "Campaigns" tab button; the batch surface has no equivalent, which is the
      // concrete form the CP-PLC-012 gap takes.
      await expect(
        clustersPage.campaignControls(),
        'a batch has no campaign picker — a campaign can only arrive inside a playlist',
      ).toHaveCount(0);
    } finally {
      // Restore the cluster exactly as it was found. Skipping this leaves a
      // colleague's screens playing the wrong KIND of content.
      if (original && original !== 'playlist') {
        await clustersPage.openCluster(cluster!.id);
        if (await clustersPage.hasBatches(20_000)) {
          await clustersPage.setContentMode(original).catch(() => undefined);
        }
      }
    }
  });

  test('CLU-004 · the content-mode toggle survives a reload @ui @regression', async ({
    clustersPage,
  }) => {
    test.setTimeout(180_000);
    const cluster = await firstClusterWithBatch(clustersPage);
    test.skip(!cluster, 'No cluster on this account has a batch, so it has no content surface.');

    // The mode is stored server-side (POST /cluster/updateManageMode/<id>), so it
    // has to survive a reload. A mode held only in component state looks correct
    // until the operator refreshes and finds the batch back on Files.
    const mode = await clustersPage.contentMode();
    await clustersPage.openCluster(cluster!.id);
    expect(await clustersPage.hasBatches(30_000), 'the cluster must re-render its batches').toBe(
      true,
    );
    expect(
      await clustersPage.contentMode(),
      'the content mode must be persisted, not held in component state',
    ).toBe(mode);
  });

  test('CLU-005 · BUG-CLU-01 · a batch content URL must open the batch, not redirect to the listing @ui @negative', async ({
    clustersPage,
    page,
  }) => {
    test.setTimeout(180_000);
    test.fail(
      true,
      'BUG-CLU-01: /batch-settings/<id> is not addressable — a direct navigation, ' +
        'and therefore any reload or bookmark of the page, lands on /clusters instead.',
    );

    const cluster = await firstClusterWithBatch(clustersPage);
    test.skip(!cluster, 'No cluster on this account has a batch, so it has no content surface.');

    const [batchId] = await clustersPage.batchIds();
    expect(batchId, 'the cluster must expose a batch id').toBeTruthy();

    // Reached by clicking, this page works. Reached by URL it does not, so an
    // operator who refreshes mid-assignment is bounced to the listing and loses
    // the batch they were editing. It also means the page cannot be linked in a
    // bug report or a runbook.
    await page.goto(`/batch-settings/${batchId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8_000);
    expect(new URL(page.url()).pathname, 'a batch content URL must resolve to the batch').toBe(
      `/batch-settings/${batchId}`,
    );
  });
});
