// =============================================================================
//  Live ETA Widget — full test suite
//  ETA-001 … ETA-073  (CRUD · Renderer · BVA · Negative · Security · API)
//
//  ── Feature under test ──────────────────────────────────────────────────────
//  "Live ETA" is a digital-signage widget that shows estimated travel time and
//  distance from one pickup location to one or more destinations.  Operators
//  configure it in Library → Widgets → Live ETA; the player then loads a public
//  renderer URL (https://widgets.signagecloud.in/widget/{id}).
//
//  ── Ground truth (mapped live on cms.wilyersignage.com v3.5.25, 2026-08-04) ─
//  Configurable fields:  Widget Name, Pickup Location, Destination 1..N,
//                        optional per-destination custom name.
//  NOT configurable:     transport mode, refresh interval, units, traffic model,
//                        thresholds, scheduled departure.  Cases asserting those
//                        would be asserting a feature that does not exist, so
//                        none are written — see NOT_IMPLEMENTED in the data file.
//
//  API contract:
//    GET    /widget/read?type=liveEta&…   list
//    GET    /widget/read/{id}             single
//    POST   /widget/create                create  → 200 { message } (no id!)
//    POST   /widget/update/{id}           update
//    DELETE /widget/delete/{id}           delete
//    GET    /widget/readPublic/{id}       renderer config — unauthenticated
//
//  ── Test strategy ───────────────────────────────────────────────────────────
//  1. CRUD      — UI create/edit/delete, each settled by an API read-back.
//  2. Renderer  — what the player actually paints (the value the feature sells).
//  3. BVA       — name length, coordinate edges, destination cardinality.
//  4. Negative  — missing fields, malformed coordinates, unroutable pairs.
//  5. Security  — XSS / SQLi / NoSQL payloads, anonymous access, IDOR, headers.
//  6. API       — status codes, schema, latency.
//
//  ── Shared-server discipline ────────────────────────────────────────────────
//  •  Destructive tests skip unless CMS_ALLOW_DESTRUCTIVE=true.
//  •  Teardown removes only THIS worker's QA_ETA_* artefacts.
//  •  No colleague's widgets are ever touched.
//
//  ── Persistence rule ────────────────────────────────────────────────────────
//  Persistence is proven by API read-back, never by a toast.  Toast lifetime
//  (~11 s) exceeds a create loop, so a stale toast reads as false success.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { EtaWidgetService, type EtaWidget } from '../../../../api/services/EtaWidgetService';
import {
  ETA_PREFIX,
  ETA_WIDGET_TYPE,
  etaUniqueName,
  place,
  PLACES,
  PLACE_QUERIES,
  validEtaPayload,
  ETA_NAMES,
  COORD_BOUNDARIES,
  MALFORMED_COORDS,
  DESTINATION_COUNTS,
} from '../../../../test-data/eta-widget.data';

// ── Guards ───────────────────────────────────────────────────────────────────

//  ENV.ALLOW_DESTRUCTIVE — not the raw env var. It is forced off on production
//  regardless of CMS_ALLOW_DESTRUCTIVE, which is exactly the guard we want:
//  reading the raw variable would let a stray shell export write to live.
const DESTRUCTIVE = ENV.ALLOW_DESTRUCTIVE;

/**
 * Call at the top of any test that issues a create/update/delete.
 *
 * This includes NEGATIVE create probes. It is tempting to treat "the API should
 * reject this" as read-only — but on this product the API returns 200 for most
 * of them, so an ungated negative probe silently writes junk to the server it
 * was meant to leave alone. Gate anything that can POST.
 */
function destructive(): void {
  test.skip(
    !DESTRUCTIVE,
    ENV.IS_PRODUCTION
      ? 'write tests are blocked on production'
      : 'set CMS_ALLOW_DESTRUCTIVE=true to run write tests',
  );
}

/** Only this worker's artefacts, so parallel workers never fight. */
const workerPrefix = (wi: number) => `${ETA_PREFIX}w${wi}_`;

/** Names created during this file's run — swept in the final teardown. */
const created = new Set<string>();
const track = (name: string): string => {
  created.add(name);
  return name;
};

test.afterAll(async ({ browser }) => {
  if (!DESTRUCTIVE || created.size === 0) return;
  const ctx = await browser.newContext();
  try {
    const api = await EtaWidgetService.fromContext(ctx);
    const all = await api.listAll();
    for (const w of all) if (created.has(w.name)) await api.deleteQuietly(w.id);
  } finally {
    await ctx.close();
    created.clear();
  }
});

// =============================================================================
//  A · CRUD  (UI-driven, API-verified)
// =============================================================================

test.describe('Live ETA widget — CRUD @regression', () => {
  test.describe.configure({ mode: 'serial' });

  test('ETA-001 @smoke Live ETA type tile is reachable and the grid loads', async ({
    etaWidgetPage,
  }) => {
    await etaWidgetPage.open();
    // Either populated or an honest empty state — both mean the grid loaded.
    await expect(
      etaWidgetPage.widgetCards.first().or(etaWidgetPage.emptyState.first()),
    ).toBeVisible();
  });

  test('ETA-002 @smoke create through the UI and read it back from the API', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const name = track(etaUniqueName('create', ti.workerIndex));

    await etaWidgetPage.open();
    await etaWidgetPage.createWidget(name, PLACE_QUERIES.pickup, PLACE_QUERIES.destination);

    // Persistence is settled here, not by the toast.
    await expect.poll(() => etaApi.findByName(name), { timeout: 20_000 }).toBeDefined();
    const saved = (await etaApi.findByName(name)) as EtaWidget;

    expect(saved.type).toBe(ETA_WIDGET_TYPE);
    expect(saved.data.pickup.location.address).toMatch(/Connaught Place/i);
    expect(saved.data.destinations).toHaveLength(1);
    expect(saved.data.destinations[0].location.address).toMatch(/Airport/i);
    // Coordinates must round-trip as numbers, not strings.
    expect(typeof saved.data.pickup.location.lat).toBe('number');
    expect(typeof saved.data.destinations[0].location.lng).toBe('number');
  });

  test('ETA-003 edit modal rehydrates every saved field', async ({ etaWidgetPage, etaApi }, ti) => {
    destructive();
    const name = track(etaUniqueName('edit-rehydrate', ti.workerIndex));
    await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.openEditModal(name);

    await expect(etaWidgetPage.nameInput('update')).toHaveValue(name);
    await expect(etaWidgetPage.pickupInput('update')).toHaveValue(/Connaught Place/i);
    await expect(etaWidgetPage.destinationInput(1, 'update')).toHaveValue(/Airport/i);
  });

  test('ETA-004 @smoke edit modal computes a live ETA and distance', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const name = track(etaUniqueName('edit-eta', ti.workerIndex));
    await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.openEditModal(name);

    // This is the whole point of the feature — a real duration and distance.
    await expect
      .poll(() => etaWidgetPage.computedEtaText('update'), { timeout: 25_000 })
      .not.toBeNull();

    const eta = (await etaWidgetPage.computedEtaText('update')) as string;
    expect(eta, 'edit modal must show "<duration> · <distance>"').toMatch(/\d+\s*(min|hour|hr)/i);
    expect(eta).toMatch(/[\d.]+\s*(km|mi|m)\b/i);
  });

  test('ETA-005 rename persists', async ({ etaWidgetPage, etaApi }, ti) => {
    destructive();
    const name = track(etaUniqueName('rename', ti.workerIndex));
    const renamed = track(`${name}_EDITED`);
    await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.openEditModal(name);
    await etaWidgetPage.fillName(renamed, 'update');
    await etaWidgetPage.save('update');

    await expect.poll(() => etaApi.findByName(renamed), { timeout: 20_000 }).toBeDefined();
    expect(await etaApi.findByName(name), 'old name must no longer exist').toBeUndefined();
  });

  test('ETA-006 add a second destination through the UI', async ({ etaWidgetPage, etaApi }, ti) => {
    destructive();
    const name = track(etaUniqueName('add-dest', ti.workerIndex));
    await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.openEditModal(name);
    await etaWidgetPage.addDestination('update');
    await etaWidgetPage.chooseDestination(PLACE_QUERIES.destination2, 2, 'update');
    await etaWidgetPage.save('update');

    await expect
      .poll(async () => (await etaApi.findByName(name))?.data.destinations.length, {
        timeout: 20_000,
      })
      .toBe(2);
  });

  test('ETA-007 cancelling the create modal persists nothing', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    const name = etaUniqueName('cancelled', ti.workerIndex);

    await etaWidgetPage.open();
    await etaWidgetPage.openCreateModal();
    await etaWidgetPage.fillName(name);
    await etaWidgetPage.cancel();

    await expect(etaWidgetPage.createModal).toBeHidden();
    expect(await etaApi.findByName(name)).toBeUndefined();
  });

  test('ETA-008 delete confirmation names the widget being deleted', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const name = track(etaUniqueName('delete-prompt', ti.workerIndex));
    await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.openDeleteModal(name);

    expect(await etaWidgetPage.deletePromptText()).toContain(name);
  });

  test('ETA-009 cancelling delete keeps the widget', async ({ etaWidgetPage, etaApi }, ti) => {
    destructive();
    const name = track(etaUniqueName('delete-cancel', ti.workerIndex));
    const seeded = await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.deleteWidget(name, false);

    expect(await etaApi.findByName(name)).toBeDefined();
    expect((await etaApi.read(seeded.id)).id).toBe(seeded.id);
  });

  test('ETA-010 @smoke confirming delete removes it everywhere', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const name = etaUniqueName('delete-confirm', ti.workerIndex);
    const seeded = await etaApi.seed(name);

    await etaWidgetPage.open();
    await etaWidgetPage.deleteWidget(name, true);

    await expect.poll(() => etaApi.findByName(name), { timeout: 20_000 }).toBeUndefined();
    expect(
      (await etaApi.readRaw(seeded.id)).status(),
      'read after delete must not still return the document',
    ).toBeGreaterThanOrEqual(400);
  });

  test('ETA-011 deleting the same widget twice is idempotent, not a 500', async ({
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(etaUniqueName('double-delete', ti.workerIndex));

    expect((await etaApi.deleteRaw(seeded.id)).ok()).toBe(true);
    expect(
      (await etaApi.deleteRaw(seeded.id)).status(),
      'second delete must not be a server error',
    ).toBeLessThan(500);
  });

  test('ETA-012 updating a deleted widget is refused', async ({ etaApi }, ti) => {
    destructive();
    const seeded = await etaApi.seed(etaUniqueName('update-deleted', ti.workerIndex));
    await etaApi.deleteRaw(seeded.id);

    const res = await etaApi.updateRaw(seeded.id, validEtaPayload('resurrected'));
    expect(res.status(), 'updating a deleted widget must be a 4xx').toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

// =============================================================================
//  B · Renderer — what the player actually paints
//
//  The section that matters most: a widget that saves correctly but renders
//  blank is worthless on a screen.
// =============================================================================

test.describe('Live ETA widget — renderer @regression', () => {
  test('ETA-020 @critical the public renderer paints an ETA, not an empty page', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('render', ti.workerIndex)));

    await etaWidgetPage.openRenderer(seeded.id);
    // Generous window: fetch config, then route.
    await etaWidgetPage.page.waitForTimeout(8_000);

    const text = await etaWidgetPage.rendererText();
    expect(text, 'renderer painted an empty page — nothing would show on a screen').not.toBe('');
    expect(await etaWidgetPage.rendererShowsEta(), `renderer body was: ${text.slice(0, 200)}`).toBe(
      true,
    );
  });

  test('ETA-021 renderer never paints NaN / undefined / null', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('render-nan', ti.workerIndex)));

    await etaWidgetPage.openRenderer(seeded.id);
    await etaWidgetPage.page.waitForTimeout(8_000);

    expect(await etaWidgetPage.rendererText()).not.toMatch(/\bNaN\b|\bundefined\b|\bnull\b/);
  });

  test('ETA-022 renderer survives a failing route provider', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('render-500', ti.workerIndex)));

    // Fail every routing call the renderer makes.
    await etaWidgetPage.page.route(/(maps\.googleapis|distancematrix|directions)/i, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }),
    );

    await etaWidgetPage.openRenderer(seeded.id);
    await etaWidgetPage.page.waitForTimeout(8_000);

    const text = await etaWidgetPage.rendererText();
    expect(text, 'provider failure must produce a visible state, not a void').not.toBe('');
    expect(text).not.toMatch(/\bNaN\b|\bundefined\b/);
  });

  test('ETA-023 renderer handles a timing-out provider', async ({ etaWidgetPage, etaApi }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('render-timeout', ti.workerIndex)));

    await etaWidgetPage.page.route(/(maps\.googleapis|distancematrix|directions)/i, async (r) => {
      await new Promise((f) => setTimeout(f, 15_000));
      await r.abort();
    });

    await etaWidgetPage.openRenderer(seeded.id);
    await etaWidgetPage.page.waitForTimeout(10_000);

    // A loading state is acceptable; a blank page is not.
    expect(await etaWidgetPage.rendererText()).not.toBe('');
  });

  test('ETA-024 renderer for a non-existent id fails safely', async ({ etaWidgetPage }) => {
    await etaWidgetPage.openRenderer('000000000000000000000000');
    await etaWidgetPage.page.waitForTimeout(5_000);

    expect(await etaWidgetPage.rendererText()).not.toMatch(/\bundefined\b|\bNaN\b|stack trace/i);
  });

  test('ETA-025 renderer does not print a Maps API key as visible text', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('render-key', ti.workerIndex)));

    await etaWidgetPage.openRenderer(seeded.id);
    await etaWidgetPage.page.waitForTimeout(5_000);

    expect(
      await etaWidgetPage.rendererText(),
      'API key must never be rendered as visible text',
    ).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  test('ETA-026 renderer polling does not stampede the config endpoint', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('render-poll', ti.workerIndex)));

    let configCalls = 0;
    await etaWidgetPage.page.route(/\/widget\/readPublic\//, (r) => {
      configCalls += 1;
      return r.continue();
    });

    await etaWidgetPage.openRenderer(seeded.id);
    await etaWidgetPage.page.waitForTimeout(30_000);

    // 30 s of runtime should not need more than a handful of config reads.
    expect(configCalls, `readPublic called ${configCalls}× in 30 s`).toBeLessThanOrEqual(6);
  });
});

// =============================================================================
//  C · Boundary value analysis
// =============================================================================

test.describe('Live ETA widget — BVA @boundary', () => {
  test('ETA-030 empty name is rejected', async ({ etaApi }) => {
    destructive();
    const res = await etaApi.createRaw(validEtaPayload(ETA_NAMES.blank));
    expect(res.status(), 'blank name must not create a widget').toBeGreaterThanOrEqual(400);
  });

  test('ETA-031 whitespace-only name is rejected', async ({ etaApi }) => {
    destructive();
    expect(
      (await etaApi.createRaw(validEtaPayload(ETA_NAMES.whitespace))).status(),
    ).toBeGreaterThanOrEqual(400);
  });

  test('ETA-032 single-character name is accepted', async ({ etaApi }, ti) => {
    destructive();
    const name = track(`${workerPrefix(ti.workerIndex)}A`);
    expect((await etaApi.createRaw(validEtaPayload(name))).ok()).toBe(true);
    expect(await etaApi.findByName(name)).toBeDefined();
  });

  test('ETA-033 a 255-char name round-trips untruncated', async ({ etaApi }, ti) => {
    destructive();
    const name = `${workerPrefix(ti.workerIndex)}${ETA_NAMES.at255}`.slice(0, 255);
    const res = await etaApi.createRaw(validEtaPayload(name));
    test.skip(!res.ok(), `server caps the name below 255 (status ${res.status()})`);
    track(name);

    expect((await etaApi.findByName(name))?.name, 'name must not be silently truncated').toBe(name);
  });

  test('ETA-034 an absurdly long name (5 000 chars) is bounded', async ({ etaApi }, ti) => {
    destructive();
    const name = `${workerPrefix(ti.workerIndex)}${ETA_NAMES.huge}`;
    const res = await etaApi.createRaw(validEtaPayload(name));
    if (res.ok()) track(name);

    expect(
      res.status(),
      'an unbounded name field is a storage/DoS hazard — expect a 4xx',
    ).toBeGreaterThanOrEqual(400);
  });

  for (const c of COORD_BOUNDARIES) {
    test(`ETA-035-${c.id} coordinate boundary: ${c.note}`, async ({ etaApi }, ti) => {
      destructive();
      const name = etaUniqueName(`coord-${c.id}`, ti.workerIndex);
      const payload = validEtaPayload(name);
      payload.data.destinations = [place(c.lat, c.lng, `boundary probe ${c.id}`)];

      const res = await etaApi.createRaw(payload);
      if (res.ok()) track(name);

      if (c.valid) {
        expect(res.ok(), `${c.note} is in range and must be accepted`).toBe(true);
      } else {
        expect(res.status(), `${c.note} must be rejected`).toBeGreaterThanOrEqual(400);
      }
    });
  }

  test('ETA-036 zero destinations is rejected', async ({ etaApi }, ti) => {
    destructive();
    const payload = validEtaPayload(etaUniqueName('no-dest', ti.workerIndex));
    payload.data.destinations = [];
    expect((await etaApi.createRaw(payload)).status()).toBeGreaterThanOrEqual(400);
  });

  test('ETA-037 ten destinations are accepted and all persist', async ({ etaApi }, ti) => {
    destructive();
    const name = etaUniqueName('ten-dest', ti.workerIndex);
    const payload = validEtaPayload(name);
    payload.data.destinations = Array.from({ length: DESTINATION_COUNTS.ten }, (_, i) =>
      place(28.5 + i / 100, 77.1 + i / 100, `Destination ${i + 1}, New Delhi`),
    );

    const res = await etaApi.createRaw(payload);
    test.skip(!res.ok(), `server caps destinations below 10 (status ${res.status()})`);
    track(name);

    expect((await etaApi.findByName(name))?.data.destinations).toHaveLength(DESTINATION_COUNTS.ten);
  });

  test('ETA-038 500 destinations are bounded, not silently stored', async ({ etaApi }, ti) => {
    destructive();
    const name = etaUniqueName('flood-dest', ti.workerIndex);
    const payload = validEtaPayload(name);
    payload.data.destinations = Array.from({ length: DESTINATION_COUNTS.fiveHundred }, () =>
      PLACES.delhiAirport(),
    );

    const res = await etaApi.createRaw(payload);
    if (res.ok()) track(name);

    expect(
      res.status(),
      'unbounded destinations means unbounded routing spend on every refresh',
    ).toBeGreaterThanOrEqual(400);
  });

  test('ETA-039 pagination limit above the server ceiling is a 400, not a clamp', async ({
    etaApi,
  }) => {
    expect((await etaApi.listRaw({ limit: 100_000 })).status()).toBeGreaterThanOrEqual(400);
  });

  test('ETA-040 page beyond the last returns an empty set, not an error', async ({ etaApi }) => {
    const res = await etaApi.listRaw({ page: 99_999, limit: 10 });
    expect(res.ok()).toBe(true);
    expect((await res.json()).docs).toEqual([]);
  });
});

// =============================================================================
//  D · Negative paths
// =============================================================================

test.describe('Live ETA widget — negative @negative', () => {
  test('ETA-050 saving an empty create form persists nothing', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    // A global count is racy with parallel workers, so probe by a name only
    // this test could have written.
    const name = etaUniqueName('empty-submit', ti.workerIndex);

    await etaWidgetPage.open();
    await etaWidgetPage.openCreateModal();
    await etaWidgetPage.fillName(name);
    await etaWidgetPage.save();

    // The modal staying open is the product's (silent) rejection signal.
    await expect(etaWidgetPage.createModal).toBeVisible();
    expect(
      await etaApi.findByName(name),
      'a widget with no pickup and no destination must not be stored',
    ).toBeUndefined();
  });

  test('ETA-051 empty create form surfaces an actionable validation message', async ({
    etaWidgetPage,
  }) => {
    await etaWidgetPage.open();
    await etaWidgetPage.openCreateModal();
    await etaWidgetPage.save();

    // Known gap in v3.5.25: the rejection is silent. Asserted honestly so the
    // suite reports the day it is fixed — and today, why it is not.
    expect(
      await etaWidgetPage.hasInlineError(etaWidgetPage.nameInput()),
      'no inline error on empty submit — the user gets no feedback at all',
    ).toBe(true);
  });

  test('ETA-052 missing pickup is rejected by the API', async ({ etaApi }, ti) => {
    destructive();
    const res = await etaApi.createRaw({
      name: etaUniqueName('no-pickup', ti.workerIndex),
      data: { destinations: [PLACES.delhiAirport()] },
      type: ETA_WIDGET_TYPE,
      faceId: 1,
      faceUrl: '/media/widgets/google-maps.png',
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('ETA-053 missing name is rejected by the API', async ({ etaApi }) => {
    destructive();
    const payload = validEtaPayload('x') as unknown as Record<string, unknown>;
    delete payload.name;
    expect((await etaApi.createRaw(payload)).status()).toBeGreaterThanOrEqual(400);
  });

  test('ETA-054 empty data object is rejected', async ({ etaApi }, ti) => {
    destructive();
    const res = await etaApi.createRaw({
      name: etaUniqueName('no-data', ti.workerIndex),
      data: {},
      type: ETA_WIDGET_TYPE,
      faceId: 1,
      faceUrl: '/media/widgets/google-maps.png',
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  for (const c of MALFORMED_COORDS) {
    test(`ETA-055-${c.id} malformed coordinates are rejected`, async ({ etaApi }, ti) => {
      destructive();
      const name = etaUniqueName(`bad-${c.id}`, ti.workerIndex);
      const res = await etaApi.createRaw({
        name,
        data: {
          pickup: { location: { lat: c.lat, lng: c.lng, address: 'malformed probe' } },
          destinations: [PLACES.delhiAirport()],
        },
        type: ETA_WIDGET_TYPE,
        faceId: 1,
        faceUrl: '/media/widgets/google-maps.png',
      });
      if (res.ok()) track(name);

      expect(res.status(), `${c.id} must not be stored`).toBeGreaterThanOrEqual(400);
    });
  }

  test('ETA-056 unknown widget type is rejected', async ({ etaApi }, ti) => {
    destructive();
    const name = etaUniqueName('bad-type', ti.workerIndex);
    const res = await etaApi.createRaw({ ...validEtaPayload(name), type: 'notAWidgetType' });
    if (res.ok()) track(name);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('ETA-057 a typed-but-unselected location is not persisted', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    // Places returns a fuzzy suggestion for almost any string, so "no
    // suggestion" is not a meaningful assertion. What matters is that free text
    // the operator never confirmed cannot become a saved coordinate.
    const name = etaUniqueName('unconfirmed-place', ti.workerIndex);

    await etaWidgetPage.open();
    await etaWidgetPage.openCreateModal();
    await etaWidgetPage.fillName(name);
    await etaWidgetPage.pickupInput().pressSequentially(PLACE_QUERIES.gibberish, { delay: 40 });
    await etaWidgetPage.destinationInput(1).pressSequentially(PLACE_QUERIES.gibberish, { delay: 40 });
    await etaWidgetPage.save();

    expect(
      await etaApi.findByName(name),
      'unconfirmed free text must not be stored as a location',
    ).toBeUndefined();
  });

  test('ETA-058 an unroutable pair states so instead of going blank', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const name = track(etaUniqueName('unroutable', ti.workerIndex));
    // Delhi → Reykjavik: no road route exists.
    await etaApi.seedRoute(name, PLACES.connaughtPlace(), [
      place(64.1466, -21.9426, 'Reykjavik, Iceland'),
    ]);

    await etaWidgetPage.open();
    await etaWidgetPage.openEditModal(name);
    await etaWidgetPage.page.waitForTimeout(8_000);

    const body = (await etaWidgetPage.updateModal.innerText()).replace(/\s+/g, ' ');
    expect(body, 'no-route must be stated, not left blank').toMatch(
      /no route|unavailable|not available|cannot|unreachable/i,
    );
    expect(body).not.toMatch(/\bNaN\b|\bundefined\b/);
  });

  test('ETA-059 identical pickup and destination render sanely', async ({
    etaWidgetPage,
    etaApi,
  }, ti) => {
    destructive();
    const name = track(etaUniqueName('same-place', ti.workerIndex));
    await etaApi.seedRoute(name, PLACES.connaughtPlace(), [PLACES.connaughtPlace()]);

    await etaWidgetPage.open();
    await etaWidgetPage.openEditModal(name);
    await etaWidgetPage.page.waitForTimeout(8_000);

    expect(await etaWidgetPage.updateModal.innerText()).not.toMatch(
      /\bNaN\b|\bundefined\b|Infinity/,
    );
  });
});

// =============================================================================
//  E · Security
// =============================================================================

test.describe('Live ETA widget — security @security', () => {
  const INJECTIONS = [
    ['xss', ETA_NAMES.xss],
    ['xss-img', ETA_NAMES.xssImg],
    ['sqli', ETA_NAMES.sqlish],
    ['nosql', ETA_NAMES.nosql],
    ['template', ETA_NAMES.template],
    ['traversal', ETA_NAMES.traversal],
    ['unicode', ETA_NAMES.unicode],
  ] as const;

  for (const [key, payload] of INJECTIONS) {
    test(`ETA-060-${key} injection payload in the name is stored inert`, async ({
      etaWidgetPage,
      etaApi,
    }, ti) => {
      destructive();
      const name = `${workerPrefix(ti.workerIndex)}${payload}`;

      const res = await etaApi.createRaw(validEtaPayload(name));
      expect(res.status(), 'an injection payload must never 500 the API').not.toBe(500);
      test.skip(!res.ok(), `server rejected the payload with ${res.status()} — also acceptable`);
      track(name);

      expect(
        (await etaApi.findByName(name))?.name,
        'payload must round-trip literally, not partially stripped',
      ).toBe(name);

      await etaWidgetPage.open();
      expect(
        await etaWidgetPage.cardScriptsExecuted(name),
        'payload executed instead of rendering as text',
      ).toBe(false);
    });
  }

  test('ETA-061 @critical widget list rejects anonymous callers', async ({ etaApi }) => {
    expect([401, 403]).toContain((await etaApi.asAnonymous().listRaw()).status());
  });

  test('ETA-062 widget list rejects a forged token', async ({ etaApi }) => {
    const res = await etaApi.asToken('eyJhbGciOiJIUzI1NiJ9.forged.signature').listRaw();
    expect([401, 403]).toContain(res.status());
  });

  test('ETA-063 @critical readPublic exposes only render config, and nothing else', async ({
    etaApi,
  }, ti) => {
    destructive();
    const seeded = await etaApi.seed(track(etaUniqueName('public-read', ti.workerIndex)));

    const res = await etaApi.readPublicRaw(seeded.id);

    // The player needs this unauthenticated, so 200 is by design — but it means
    // anyone holding an id reads the account's pickup/destination addresses.
    // Assert the blast radius stays limited to render config.
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['_id', 'data', 'faceId', 'folderId', 'path', 'type'].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/token|email|userId|accountId|password/i);
  });

  test('ETA-064 readPublic on an unknown id does not leak internals', async ({ etaApi }) => {
    const res = await etaApi.readPublicRaw('000000000000000000000000');
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toMatch(/at .*\.js:\d+|MongoError|stack/i);
  });

  test('ETA-065 IDOR — reading an id this account does not own is refused', async ({ etaApi }) => {
    expect([400, 403, 404]).toContain((await etaApi.readRaw('000000000000000000000001')).status());
  });

  test('ETA-066 API sets nosniff and HSTS', async ({ etaApi }) => {
    const h = (await etaApi.listRaw({ limit: 1 })).headers();
    expect(h['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
    expect(h['strict-transport-security'], 'HSTS').toBeTruthy();
  });

  test('ETA-067 API does not advertise its stack', async ({ etaApi }) => {
    const h = (await etaApi.listRaw({ limit: 1 })).headers();
    expect(h['x-powered-by'], 'X-Powered-By discloses the framework').toBeUndefined();
  });
});

// =============================================================================
//  F · API contract & performance
// =============================================================================

test.describe('Live ETA widget — API @api', () => {
  test('ETA-070 list response matches the paginated contract', async ({ etaApi }) => {
    const res = await etaApi.listRaw({ limit: 5 });
    expect(res.ok()).toBe(true);

    const body = await res.json();
    for (const key of ['docs', 'totalDocs', 'limit', 'totalPages', 'page']) {
      expect(body, `missing "${key}"`).toHaveProperty(key);
    }
    expect(Array.isArray(body.docs)).toBe(true);

    for (const doc of body.docs) {
      expect(doc.type).toBe(ETA_WIDGET_TYPE);
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('path');
      expect(doc.data).toHaveProperty('pickup');
      expect(Array.isArray(doc.data.destinations)).toBe(true);
      expect(typeof doc.data.pickup.location.lat).toBe('number');
    }
  });

  test('ETA-071 the type filter does not leak other widget types', async ({ etaApi }) => {
    const docs = (await etaApi.list({ limit: 100 })).docs;
    expect(docs.every((d) => d.type === ETA_WIDGET_TYPE)).toBe(true);
  });

  test('ETA-072 list latency stays inside budget', async ({ etaApi }) => {
    const started = Date.now();
    const res = await etaApi.listRaw({ limit: 50 });
    const ms = Date.now() - started;

    expect(res.ok()).toBe(true);
    expect(ms, `widget/read took ${ms}ms`).toBeLessThan(2_000);
  });

  test('ETA-073 create response does not return the new id (contract gap)', async ({
    etaApi,
  }, ti) => {
    destructive();
    const name = track(etaUniqueName('create-body', ti.workerIndex));
    const res = await etaApi.createRaw(validEtaPayload(name));

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('message');
    // Documented so a future fix is caught: callers must re-list to learn the id
    // of the widget they just created.
    expect(
      body.id ?? body._id,
      'create still omits the new id — every caller must list to find it',
    ).toBeUndefined();
  });
});
