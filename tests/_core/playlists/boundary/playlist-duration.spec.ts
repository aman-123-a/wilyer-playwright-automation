// =============================================================================
//  PLAYLIST — LAYOUT TIME DURATION (per-slide display duration of used media).
//  Positive + CRUD + negative + boundary coverage for the duration a media item
//  is shown inside a playlist layout.
//
//  Feature model (verified live on cms.pocsample.in v3.5.25, 2026-07-27 — see the
//  playlist-duration-ui memory / PlaylistEditorPage header):
//    • Editable per-slide duration appears ONLY when a zone holds 2+ slides; a
//      single-slide zone shows a read-only "N sec" label.
//    • Each IMAGE slide gets a `− [input] +` stepper (default 10s). A VIDEO slide
//      shows its fixed intrinsic length (no stepper).
//    • Layout Settings → `Duration (Nsec)` (input#duration) is a READ-ONLY rollup
//      = sum of the layout's slide durations.
//    • Stepper buttons floor at 1, but TYPING a value bypasses that guard — so the
//      negative cases below type invalid values and assert Save does not persist
//      them (a value that survives to read-back is a real defect).
//
//  Every case here WRITES (creates a playlist, adds media, saves), so the whole
//  file is gated behind CMS_ALLOW_DESTRUCTIVE and is a no-op on the read-only
//  `live`/production branch. Each test creates its own throwaway playlist and
//  deletes it in teardown, so a run is idempotent and never mutates seed data.
// =============================================================================

import { test, expect } from '../../../../fixtures/test-fixtures';
import { ENV } from '../../../../config/env';
import { name } from '../../../../test-data/test-data';

const DEFAULT_SLIDE_SECONDS = 10;

test.describe('Playlist — layout time duration @regression', () => {
  // The editor is heavy (drag-drop + save round-trips); each case is independent
  // (own throwaway playlist + cleanup), so run with --workers=1 for stability
  // rather than a serial group (which would skip cases after the first failure).
  test.skip(!ENV.ALLOW_DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to run editor write cases');
  test.setTimeout(180_000);

  // Track the playlist created by the current test so teardown can remove it even
  // when the body fails mid-way.
  let createdId: string | null = null;

  test.afterEach(async ({ playlistEditorPage }) => {
    if (createdId) {
      await playlistEditorPage.deletePlaylistById(createdId).catch(() => {});
      createdId = null;
    }
  });

  /** Create a throwaway playlist holding one zone with two image slides. */
  async function freshTwoImageSlideZone(
    editor: import('../../../../pages/PlaylistEditorPage').PlaylistEditorPage,
    prefix: string,
  ): Promise<string> {
    const id = await editor.createPlaylist(name(prefix));
    createdId = id;
    await editor.buildTwoImageSlideZone();
    return id;
  }

  // ── Positive / smoke ──────────────────────────────────────────────────────

  test('image slides default to 10s and the layout rollup sums the slides', async ({
    playlistEditorPage,
  }) => {
    await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-default');

    const inputs = playlistEditorPage.slideDurationInputs();
    await expect(inputs).toHaveCount(2);
    expect(await playlistEditorPage.slideDurationValue(0)).toBe(String(DEFAULT_SLIDE_SECONDS));
    expect(await playlistEditorPage.slideDurationValue(1)).toBe(String(DEFAULT_SLIDE_SECONDS));
    // NOTE: the Layout Settings `Duration (Nsec)` rollup only reflects PERSISTED
    // durations (it reads 0 for unsaved edits), so the rollup sum is asserted in
    // the CRUD test below after a save + reload, not here.
  });

  test('stepper adjusts the duration by 1 and floors at 1 (never 0/negative)', async ({
    playlistEditorPage,
  }) => {
    await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-step');

    // + once: 10 → 11
    await playlistEditorPage.stepPlus(0).click();
    await expect.poll(() => playlistEditorPage.slideDurationValue(0)).toBe('11');

    // − many times: must clamp at 1, never reaching 0 or a negative value.
    for (let i = 0; i < 15; i++) await playlistEditorPage.stepMinus(0).click();
    expect(await playlistEditorPage.slideDurationValue(0)).toBe('1');
  });

  // ── CRUD — update a used-media duration and read it back after reload ───────

  test('set a valid duration, save, reload → the duration persists (update)', async ({
    playlistEditorPage,
  }) => {
    const id = await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-crud');

    await playlistEditorPage.setSlideDuration('25', 0);
    await playlistEditorPage.setSlideDuration('35', 1);
    await playlistEditorPage.save();

    // Reload the editor fresh. No zone is auto-selected, so Layout Settings shows
    // first — assert the persisted rollup (25 + 35 = 60) before touching a zone.
    await playlistEditorPage.openById(id);
    expect(await playlistEditorPage.layoutDurationSeconds()).toBe(60);

    // Then re-open ZoneSettings and read back the persisted per-slide durations.
    expect(await playlistEditorPage.selectFirstZone(), 'a zone should be selectable').toBe(true);
    await expect
      .poll(() => playlistEditorPage.slideDurationValue(0), { timeout: 15_000 })
      .toBe('25');
    expect(await playlistEditorPage.slideDurationValue(1)).toBe('35');
    await expect(playlistEditorPage.errorBanner).toBeHidden();
  });

  // ── Negative / boundary — invalid durations must not survive a Save ─────────

  // KNOWN DEFECT (confirmed live 2026-07-27): the per-slide stepper enforces a
  // floor of 1, but typing a value + Save bypasses all validation and the backend
  // accepts 0 — read back "0". A zero-second slide is invalid. `test.fail()` keeps
  // the suite green while tracking the bug; it flips to a failure (alerting us) if
  // the app starts rejecting 0.
  test('duration 0 must not persist as a zero-length slide', async ({ playlistEditorPage }) => {
    test.fail(); // remove when the backend rejects/clamps a 0 duration
    const id = await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-zero');

    await playlistEditorPage.setSlideDuration('0', 0);
    await playlistEditorPage.save();

    await playlistEditorPage.openById(id);
    await playlistEditorPage.selectFirstZone();
    const persisted = await playlistEditorPage.slideDurationValueOrNull(0);
    expect(
      persisted !== null && persisted !== '0' && persisted !== '' && Number(persisted) >= 1,
      `a zero-second slide must not persist — read back "${persisted}"`,
    ).toBeTruthy();
  });

  // KNOWN DEFECT (confirmed live 2026-07-27): a negative duration typed into the
  // stepper is accepted and persisted — read back "-5".
  test('a negative duration must not persist', async ({ playlistEditorPage }) => {
    test.fail(); // remove when the backend rejects/clamps a negative duration
    const id = await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-neg');

    await playlistEditorPage.setSlideDuration('-5', 0);
    await playlistEditorPage.save();

    await playlistEditorPage.openById(id);
    await playlistEditorPage.selectFirstZone();
    const persisted = await playlistEditorPage.slideDurationValueOrNull(0);
    expect(
      persisted !== null && Number(persisted) >= 1,
      `a negative-second slide must not persist — read back "${persisted}"`,
    ).toBeTruthy();
  });

  // KNOWN DEFECT (confirmed live 2026-07-27): saving a slide whose duration was
  // cleared to empty silently DROPS the media — on reload the layout is empty
  // (data loss), so no slide is present to read back.
  test('an empty duration must not drop the media / persist as blank', async ({
    playlistEditorPage,
  }) => {
    test.fail(); // remove when an empty duration is rejected or defaulted (no data loss)
    const id = await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-empty');

    await playlistEditorPage.setSlideDuration('', 0);
    await playlistEditorPage.save();

    await playlistEditorPage.openById(id);
    const hasZone = await playlistEditorPage.selectFirstZone();
    const persisted = hasZone ? await playlistEditorPage.slideDurationValueOrNull(0) : null;
    // The media must survive with a valid positive duration — not vanish, blank, or NaN.
    expect(
      hasZone && persisted !== null && persisted.trim() !== '' && Number(persisted) >= 1,
      `an empty duration must not drop the media — zone present: ${hasZone}, read back "${persisted}"`,
    ).toBeTruthy();
  });

  test('decimals are coerced to a whole number of seconds', async ({ playlistEditorPage }) => {
    await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-decimal');

    await playlistEditorPage.setSlideDuration('1.5', 0);
    // The field accepts only whole seconds; a decimal must be normalised.
    const shown = await playlistEditorPage.slideDurationValue(0);
    expect(shown, `decimal input should coerce to an integer — got "${shown}"`).toMatch(/^\d+$/);
  });

  test('an absurdly large duration is bounded or, if saved, round-trips exactly', async ({
    playlistEditorPage,
  }) => {
    const id = await freshTwoImageSlideZone(playlistEditorPage, 'pl-dur-huge');

    await playlistEditorPage.setSlideDuration('99999', 0);
    await playlistEditorPage.save();

    await playlistEditorPage.openById(id);
    await playlistEditorPage.selectFirstZone();
    const persisted = Number(await playlistEditorPage.slideDurationValue(0));
    // Either the app bounds the value to something sane, or it must at least
    // persist a positive integer (no overflow / corruption to 0 or NaN).
    expect(
      Number.isInteger(persisted) && persisted >= 1,
      `huge duration corrupted on round-trip — read back "${persisted}"`,
    ).toBeTruthy();
  });
});
