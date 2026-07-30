// =============================================================================
//  Campaign & content SCHEDULING — Cases A–F of the scheduling specification.
//
//  Target: cms2.pocsample.in (branch `cms2`). Never run on `live`.
//
//  ── Where a schedule actually lives ─────────────────────────────────────────
//  Not on the campaign. Mapped live on 2026-07-29 by reading the server, and
//  confirmed against the app's own save request:
//
//      playlist.layouts[].schedule                      → a whole layout (Case E)
//      playlist.layouts[].zones[].schedule              → a zone
//      playlist.layouts[].zones[].array.data[].schedule → one item     (Cases A–D)
//
//  A zone item is EITHER `{file, duration, schedule}` OR `{campaign, duration}`,
//  and both kinds sit in the same `array.data` — which is what makes "a
//  scheduled file next to a campaign" expressible.
//
//  Schedule shape:
//      { startDate, endDate, startTime, endTime, isRoutineEnabled,
//        days: { sunday … saturday } }        `null` = no schedule = always on.
//
//  ── What this suite can and cannot prove ────────────────────────────────────
//  It proves the AUTHORING half end to end: what the editor lets a user express,
//  what the API accepts, and what the server actually stores (read-back, never a
//  toast). It does NOT prove runtime playback — whether a player skips an
//  out-of-schedule item at 3pm on a Sunday. No screen-facing endpoint is exposed
//  to the CMS session (`/screen/read` returns device rows and a playlist NAME,
//  never resolved content), so the "live screen stays in sync" half of the claim
//  is not reachable from here and is deliberately left unasserted rather than
//  faked with a proxy check. See the report for what closing that gap needs.
//
//  Standing rule inherited from the campaigns CRUD suite: persistence is proven
//  by API read-back, never by a toast.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { PlaylistService, days, ALL_DAYS, schedule } from '../../../../api';
import type { Playlist, Schedule } from '../../../../api';
import { uniqueName } from '../../../../test-data/campaigns.data';

/** Everything this suite creates carries this prefix, so teardown can sweep it. */
const PREFIX = 'QA_SCHED_';

/** A December window — Case B's "1 Dec to 31 Dec". */
const DEC = { from: '2026-12-01', to: '2026-12-31' };
/** Office hours — Case A's "9 AM to 5 PM". */
const OFFICE = { from: '09:00', to: '17:00' };
/** Case E's January layout window. */
const JAN = { from: '2027-01-01', to: '2027-01-31' };

const MON_TO_FRI = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

/** Index of the first zone item that carries a schedule control (a file item). */
const FIRST_FILE = 0;

test.describe.configure({ mode: 'serial' });

test.describe('Content scheduling · Cases A–F', () => {
  test.skip(
    !ENV.ALLOW_DESTRUCTIVE,
    'Creates and deletes playlists and campaigns. Set CMS_ALLOW_DESTRUCTIVE=true on a test environment.',
  );

  /** The shared fixture playlist: one zone holding [file, file, campaign]. */
  let playlistId = '';
  let campaignName = '';

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const context = await browser.newContext();
    const page = await context.newPage();

    const { PlaylistEditorPage } = await import('../../../../pages/PlaylistEditorPage');
    const { CampaignService } = await import('../../../../api');
    const editor = new PlaylistEditorPage(page);
    const campaigns = await CampaignService.fromContext(context);

    // A campaign of our own, so the zone holds a campaign we control.
    campaignName = uniqueName('Sched', testInfo.workerIndex);
    await campaigns.seed(campaignName, 2, 10);

    playlistId = await editor.createPlaylist(`${PREFIX}${Date.now()}`, 'scheduling suite');
    await editor.buildTwoImageSlideZone();

    // Drop the campaign into the SAME zone — Case A/D need a file and a
    // campaign side by side.
    await page.getByRole('button', { name: /^campaigns$/i }).first().click();
    await page.locator('input#search').first().fill(campaignName);
    await page.waitForTimeout(2_500);
    const card = page
      .locator('.card.bg-default.border.shadow-sm.mb-3')
      .filter({ has: page.getByText(campaignName, { exact: true }) })
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.dragTo(page.getByText(/\+\s*Drop Widgets & Files/i).first());
    await page.waitForTimeout(2_000);

    await editor.save();
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const { CampaignService } = await import('../../../../api');
    const playlists = await PlaylistService.fromContext(context);
    const campaigns = await CampaignService.fromContext(context);
    if (playlistId) await playlists.deleteQuietly(playlistId);
    const mine = await campaigns.findByName(campaignName);
    if (mine) await campaigns.deleteQuietly(mine.id);
    await context.close();
  });

  /** The fixture zone, as the server currently holds it. */
  const zoneItems = async (api: PlaylistService) =>
    PlaylistService.itemsOf(await api.read(playlistId));

  // ───────────────────────────────────────────────────────────────────────────
  //  Fixture sanity — the mixed zone the whole specification assumes
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-000 · a zone holds files and a campaign together @smoke @critical', async ({
    playlistApi,
  }) => {
    const items = await zoneItems(playlistApi);
    expect(items, 'fixture zone should hold 2 files + 1 campaign').toHaveLength(3);
    expect(items.filter((i) => i.file)).toHaveLength(2);
    expect(items.filter((i) => i.campaign)).toHaveLength(1);
    // "Mixing files, widgets and campaigns in any order is fully supported."
    expect(items[2].campaign?.name).toBe(campaignName);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Case A — a scheduled file next to a normal campaign
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-A1 · a file takes a date + time + weekday schedule, through the UI @critical @ui', async ({

    playlistEditorPage,
    playlistApi,
  }) => {
    test.setTimeout(180_000);
    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();

    await playlistEditorPage.openItemSchedule(FIRST_FILE);
    await playlistEditorPage.setScheduleDates(DEC.from, DEC.to);
    await playlistEditorPage.setScheduleTimes(OFFICE.from, OFFICE.to);
    await playlistEditorPage.setRoutine(true);
    await playlistEditorPage.selectOnlyDays(MON_TO_FRI);
    await playlistEditorPage.saveSchedule();
    await playlistEditorPage.save();

    const items = await zoneItems(playlistApi);
    const saved = items[FIRST_FILE].schedule;
    expect(saved, 'the file item must carry a schedule after saving').toBeTruthy();
    expect(saved!.startDate).toBe(DEC.from);
    expect(saved!.endDate).toBe(DEC.to);
    expect(saved!.startTime).toBe(OFFICE.from);
    expect(saved!.endTime).toBe(OFFICE.to);
    expect(saved!.isRoutineEnabled).toBe(true);

    // "Mon to Fri" must persist as exactly Mon–Fri — not as every day.
    expect(
      saved!.days,
      'a weekday selection must persist as the chosen subset, not silently widen to every day',
    ).toEqual(days('monday', 'tuesday', 'wednesday', 'thursday', 'friday'));

    // The campaign beside it is untouched and still plays every loop.
    expect(items[2].campaign, 'the campaign must still be in the zone').toBeTruthy();
    expect(items[2].schedule ?? null, 'an unscheduled campaign stays always-on').toBeNull();

    // "The overall loop order never breaks."
    expect(items.map((i) => i.campaign?.name ?? i.file?.name)).toHaveLength(3);
  });

  test('SCH-A2 · the saved weekday set round-trips back into the editor @ui @regression', async ({
    playlistEditorPage,
  }) => {
    test.setTimeout(180_000);
    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.openItemSchedule(FIRST_FILE);

    // What the user set in SCH-A1 must be what the editor shows on reopen —
    // a schedule you cannot read back is a schedule you cannot trust.
    // Auto-waiting assertions: the offcanvas is populated after it opens, so a
    // one-shot inputValue() read can land on the pre-bind empty field.
    await expect(playlistEditorPage.scheduleDateInputs().nth(0)).toHaveValue(DEC.from);
    await expect(playlistEditorPage.scheduleDateInputs().nth(1)).toHaveValue(DEC.to);
    await expect(playlistEditorPage.scheduleTimeInputs().nth(0)).toHaveValue(OFFICE.from);
    await expect(playlistEditorPage.scheduleTimeInputs().nth(1)).toHaveValue(OFFICE.to);

    for (const day of MON_TO_FRI) {
      expect(await playlistEditorPage.isDaySelected(day), `${day} should be selected`).toBe(true);
    }
    for (const day of ['saturday', 'sunday']) {
      expect(await playlistEditorPage.isDaySelected(day), `${day} should NOT be selected`).toBe(
        false,
      );
    }
    await playlistEditorPage.dismissSchedule();
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Case B / D — scheduling a whole campaign
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-B1 · a campaign in a zone offers no schedule control in the editor @ui @defect', async ({
    playlistEditorPage,
  }) => {
    test.setTimeout(180_000);
    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();

    // File items each carry a schedule badge…
    expect(await playlistEditorPage.itemHasScheduleControl(0)).toBe(true);
    expect(await playlistEditorPage.itemHasScheduleControl(1)).toBe(true);

    // …the campaign item does not. Cases B and D ("a whole campaign scheduled
    // for a date range", "two campaigns where only one is scheduled") cannot be
    // authored through the UI at all. This is BUG-SCHED-01; when the control
    // ships, this expectation flips and the test turns red on purpose.
    const badges = await playlistEditorPage.scheduleBadges().count();
    expect(
      badges,
      'BUG-SCHED-01: a campaign zone item has Edit / Change Position / Remove but no ' +
        'Schedule control, so Cases B and D are not authorable in the editor',
    ).toBe(2);
  });

  test('SCH-B2 · does the API accept a schedule on a campaign zone item? @api @defect', async ({
    playlistApi,
  }) => {
    const wanted: Schedule = schedule({
      startDate: DEC.from,
      endDate: DEC.to,
      isRoutineEnabled: false,
      days: { ...ALL_DAYS },
    });

    const res = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      const idx = PlaylistService.campaignIndex(doc);
      doc.layouts[0].zones[0].array!.data[idx].schedule = wanted;
    });
    expect(res.status(), `update should be accepted — body: ${await res.text()}`).toBe(200);

    // Accepting is not supporting: an ignored field returns 200 and vanishes.
    const items = await zoneItems(playlistApi);
    const idx = items.findIndex((i) => i.campaign);
    const saved = items[idx].schedule;

    expect(
      saved,
      'the storage model carries `schedule` on a campaign item, so a whole-campaign ' +
        'schedule (Case B) persists when written directly — the gap is the missing UI control',
    ).toBeTruthy();
    expect(saved!.startDate).toBe(DEC.from);
    expect(saved!.endDate).toBe(DEC.to);

    // Put it back, so later order/serial tests see the fixture as built.
    await playlistApi.mutate(playlistId, (doc: Playlist) => {
      const i = PlaylistService.campaignIndex(doc);
      doc.layouts[0].zones[0].array!.data[i].schedule = null;
    });
  });

  test('SCH-Z1 · a playlist read back verbatim is rejected by its own writer @api @defect', async ({
    playlistApi,
  }) => {
    // Read a document and send it straight back, changing nothing. That is the
    // most basic contract a REST resource can have, and it fails: the reader
    // emits `zone.schedule: null`, the writer's schema demands an array.
    const res = await playlistApi.mutateVerbatim(playlistId, () => {});
    const body = await res.text();

    expect(
      res.status(),
      `an unmodified read → write round-trip should be accepted. Body: ${body}`,
    ).toBe(400);
    expect(
      /schedule.*must be an array|file.*must be a string|campaign.*must be a string/.test(body),
      'BUG-SCHED-05: the playlist read model and write model disagree — the reader ' +
        'returns zone.schedule as null and expands file/campaign into objects, while ' +
        'the writer demands an array and bare id strings respectively. An unmodified ' +
        `round-trip is rejected, so every API client must special-case it. Body: ${body}`,
    ).toBe(true);

    // Zone-level scheduling is therefore unreachable: the only shape the writer
    // accepts for zone.schedule is an array, which is not what a schedule is.
    // Normalise everything else first so the zone rule is the sole variable.
    const doc = PlaylistService.normaliseForWrite(await playlistApi.read(playlistId));
    doc.layouts[0].zones[0].schedule = schedule({ startDate: DEC.from, endDate: DEC.to });
    const withZoneSchedule = await playlistApi.updateRaw(playlistId, {
      name: doc.name,
      layouts: doc.layouts,
    });
    expect(
      withZoneSchedule.status(),
      'a zone-level schedule object cannot be written at all — zone scheduling is ' +
        'present in the read model but unreachable through the API',
    ).toBe(400);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Case C — different files inside ONE campaign, each with its own schedule
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-C1 · a per-file schedule inside a campaign is rejected by the API @api @defect', async ({
    campaignApi,
  }) => {
    const files = await campaignApi.sampleMediaIds(2);
    const res = await campaignApi.createRaw({
      name: `${PREFIX}caseC_${Date.now()}`,
      defaultDuration: 10,
      folderId: null,
      data: [
        { file: files[0], duration: 10 },
        // "B: weekends only" — the campaign's own file needs its own schedule.
        {
          file: files[1],
          duration: 10,
          schedule: { startDate: DEC.from, endDate: DEC.to, days: { saturday: true } },
        },
      ],
    });

    // BUG-SCHED-02: the campaign schema is strict and has no schedule slot at
    // item level, so Case C is not expressible anywhere in the product.
    expect(res.status(), 'campaign items reject a schedule field').toBe(400);
    expect(await res.text()).toContain('data[1].schedule');
  });

  test('SCH-C2 · the campaign editor exposes no schedule fields at all @ui @defect', async ({
    playlistsPage,
    campaignPicker,
  }) => {
    test.setTimeout(180_000);
    await campaignPicker.open(await playlistsPage.anyPlaylistId());
    await campaignPicker.openCreateModal();

    const modal = campaignPicker.createModal;
    expect(
      await modal.locator('input[type="date"], input[type="time"]').count(),
      'the campaign form has name, duration and media only — no schedule of any kind',
    ).toBe(0);
    await campaignPicker.dismiss(modal);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Case E — a whole layout scheduled for a season
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-E1 · a layout takes a date-range schedule and it persists @api @critical', async ({
    playlistApi,
  }) => {
    const res = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].schedule = schedule({
        startDate: JAN.from,
        endDate: JAN.to,
        isRoutineEnabled: false,
        days: { ...ALL_DAYS },
      });
    });
    expect(res.status(), `layout schedule should save — body: ${await res.text()}`).toBe(200);

    const doc = await playlistApi.read(playlistId);
    const saved = doc.layouts[0].schedule;
    expect(saved, 'a layout must be able to carry a schedule').toBeTruthy();
    expect(saved!.startDate).toBe(JAN.from);
    expect(saved!.endDate).toBe(JAN.to);

    // Scheduling a layout must not disturb what is inside it.
    expect(PlaylistService.itemsOf(doc)).toHaveLength(3);

    await playlistApi.mutate(playlistId, (d: Playlist) => {
      d.layouts[0].schedule = schedule({ days: { ...ALL_DAYS } });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Case F — nothing currently in schedule
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-F1 · every item can be scheduled out at once, and the zone still saves @api', async ({
    playlistApi,
  }) => {
    // A window entirely in the past: at play time nothing in this zone qualifies.
    const past = schedule({
      startDate: '2020-01-01',
      endDate: '2020-01-31',
      isRoutineEnabled: false,
      days: { ...ALL_DAYS },
    });

    const res = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      for (const item of doc.layouts[0].zones[0].array!.data) item.schedule = { ...past };
    });
    expect(
      res.status(),
      `an all-out-of-schedule zone is a legal authoring state — body: ${await res.text()}`,
    ).toBe(200);

    const items = await zoneItems(playlistApi);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.schedule?.endDate, 'every item now sits outside its window').toBe('2020-01-31');
    }

    // Restore: files unscheduled, campaign unscheduled.
    await playlistApi.mutate(playlistId, (doc: Playlist) => {
      for (const item of doc.layouts[0].zones[0].array!.data) item.schedule = null;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Cross-cutting invariant — "scheduling never breaks the play order"
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-ORD · scheduling an item does not reorder the zone @api @regression', async ({
    playlistApi,
  }) => {
    const before = PlaylistService.orderOf(await playlistApi.read(playlistId));

    await playlistApi.mutate(playlistId, (doc: Playlist) => {
      // Schedule the MIDDLE item — if anything re-sorts scheduled content, a
      // middle item is where it shows.
      doc.layouts[0].zones[0].array!.data[1].schedule = schedule({
        startDate: DEC.from,
        endDate: DEC.to,
        isRoutineEnabled: true,
        days: days('saturday', 'sunday'),
      });
    });

    const after = PlaylistService.orderOf(await playlistApi.read(playlistId));
    expect(after, 'the loop order must survive a schedule change untouched').toEqual(before);

    await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data[1].schedule = null;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Boundaries — the cases a scheduling feature is usually wrong about
  // ───────────────────────────────────────────────────────────────────────────

  test('SCH-V1 · the editor constrains the date range so it cannot invert @ui @boundary', async ({
    playlistEditorPage,
  }) => {
    test.setTimeout(180_000);
    await playlistEditorPage.openById(playlistId);
    await playlistEditorPage.selectFirstZone();
    await playlistEditorPage.openItemSchedule(FIRST_FILE);
    await playlistEditorPage.setScheduleDates(DEC.from, DEC.to);

    // The From field caps at To and the To field floors at From, which is how
    // the client prevents an end-before-start range.
    const bounds = await playlistEditorPage.dateBounds();
    expect(bounds.fromMax, 'the "from" date should be capped by the "to" date').toBe(DEC.to);
    expect(bounds.toMin, 'the "to" date should be floored by the "from" date').toBe(DEC.from);
    await playlistEditorPage.dismissSchedule();
  });

  test('SCH-V2 · the API accepts an inverted date range the UI forbids @api @boundary @defect', async ({
    playlistApi,
  }) => {
    // The client constrains the range (SCH-V1). The question a boundary test
    // asks is whether the SERVER does too — a client-only rule is bypassable by
    // anyone posting directly, and an end-before-start window is unsatisfiable,
    // so the item would silently never play.
    const res = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data[FIRST_FILE].schedule = schedule({
        startDate: '2026-12-31',
        endDate: '2026-12-01',
        isRoutineEnabled: false,
        days: { ...ALL_DAYS },
      });
    });

    const items = await zoneItems(playlistApi);
    const saved = items[FIRST_FILE].schedule;
    const stored = saved?.startDate === '2026-12-31' && saved?.endDate === '2026-12-01';

    expect(
      res.status() === 200 && stored,
      'BUG-SCHED-03: the server stores end-before-start unchallenged. The range is ' +
        'unsatisfiable, so the item can never play and nothing tells the user why. ' +
        'Range validation belongs server-side, not only on the date inputs.',
    ).toBe(true);

    await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data[FIRST_FILE].schedule = null;
    });
  });

  test('SCH-V3 · routine on with every day off is storable @api @boundary @defect', async ({
    playlistApi,
  }) => {
    // "Repeat on selected days" with no day selected is the other unsatisfiable
    // state: routine is on, yet no day ever matches.
    const res = await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data[FIRST_FILE].schedule = schedule({
        startDate: DEC.from,
        endDate: DEC.to,
        isRoutineEnabled: true,
      });
    });

    const items = await zoneItems(playlistApi);
    const saved = items[FIRST_FILE].schedule;
    const empty =
      saved?.isRoutineEnabled === true && Object.values(saved.days).every((d) => d === false);

    expect(
      res.status() === 200 && empty,
      'BUG-SCHED-04: routine enabled with zero days selected is accepted and stored. ' +
        'No day can ever match, so the item is permanently hidden with no warning.',
    ).toBe(true);

    await playlistApi.mutate(playlistId, (doc: Playlist) => {
      doc.layouts[0].zones[0].array!.data[FIRST_FILE].schedule = null;
    });
  });
});
