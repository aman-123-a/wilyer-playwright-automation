// =============================================================================
//  PlaylistPreviewPage — the in-browser player behind the editor's Preview button.
//  Mapped live against cms2.pocsample.in 2026-07-30.
//
//  ── Why this exists ────────────────────────────────────────────────────────
//  Campaign loop logic (CP-LOOP-*) is playback behaviour: a campaign occupies ONE
//  zone slot and shows its NEXT file on each pass of the loop. Verifying that
//  normally needs an online screen and someone watching it. The editor's Preview
//  button opens a real player — `POST /playlist/createPreview` returns a preview
//  id, loaded in an iframe from https://preview.pocsample.in/<previewId> — which
//  runs in Chrome and rotates content exactly the same way.
//
//  ── How the player signals the visible frame (this is the whole trick) ──────
//  It PRELOADS every file in the zone as an <img>, and never changes `src`,
//  `display` or `visibility`. All of them stay `display:block; visibility:visible`
//  for the entire run. The active frame is distinguished ONLY by:
//
//        active   → opacity: 1,  z-index: 100
//        inactive → opacity: 0,  z-index: 1
//
//  Two consequences that cost real debugging time to learn:
//   • `toBeVisible()` is useless here — every frame is "visible" to Playwright.
//   • Counting elements or diffing `src` attributes detects nothing, because the
//     DOM is identical from the first frame to the last.
//  So `visibleFile()` reads computed styles, and that is the only sound way to ask
//  "what is on screen right now?".
//
//  ── Caveat on what a green result here means ────────────────────────────────
//  The requirement analysis records AS-08 ("player firmware supports campaign
//  resolution; CMS-only change is insufficient") and DEP-04 ("loop resolution
//  executes on-device"). The preview player is a DIFFERENT implementation from the
//  Android firmware. A pass here proves the loop CONTRACT is right and catches
//  regressions cheaply; it is not hardware sign-off. Specs using this carry
//  @preview so a hardware run can be selected separately.
// =============================================================================

import { type Locator, type FrameLocator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/** One observed frame: the file the player was showing at that moment. */
export interface PreviewFrame {
  /** Basename of the media file, e.g. "wilyer_1779708627628.jpg". */
  file: string;
  /** Milliseconds since sampling began. */
  at: number;
}

export class PlaylistPreviewPage extends BasePage {
  readonly previewBtn: Locator;
  readonly modal: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.previewBtn = page.getByRole('button', { name: /preview/i }).first();
    this.modal = page.locator('#previewPlaylist');
  }

  /** Open the preview modal from an already-open playlist editor. */
  async open(): Promise<this> {
    await this.previewBtn.click();
    await expect(this.modal, 'the preview modal must open').toHaveClass(/show/, {
      timeout: 20_000,
    });
    await expect(this.frameElement(), 'the preview player iframe must render').toBeVisible({
      timeout: 20_000,
    });
    return this;
  }

  frameElement(): Locator {
    return this.modal.locator('iframe').first();
  }

  frame(): FrameLocator {
    return this.modal.frameLocator('iframe');
  }

  /** The preview player URL, e.g. https://preview.pocsample.in/<previewId>. */
  async previewUrl(): Promise<string | null> {
    return this.frameElement().getAttribute('src');
  }

  /**
   * Wait for the player to boot and paint its first frame.
   *
   * The iframe is visible long before the player has media, so callers must not
   * start sampling on `open()` alone — the first samples would be empty and a
   * sequence assertion would see a phantom transition.
   */
  async waitForFirstFrame(timeout = 60_000): Promise<string> {
    let file = '';
    // The player fetches every file in the zone before it paints anything. Polling
    // straight away burns the budget on an iframe that is still downloading, so
    // give the boot a fixed head start first — measured at ~8s on cms2.
    await this.page.waitForTimeout(8_000);
    await expect
      .poll(
        async () => {
          file = (await this.visibleFile()) ?? '';
          return file;
        },
        {
          timeout,
          message: 'the preview player must paint a frame — no media became active',
        },
      )
      .not.toBe('');
    return file;
  }

  /**
   * The file currently on screen: the media element with the winning z-index among
   * those that are not transparent. Returns null before the first paint.
   *
   * Reads computed styles rather than attributes because the player switches
   * frames with opacity/z-index only — see the header note.
   */
  async visibleFile(): Promise<string | null> {
    return this.frame()
      .locator('img, video')
      .evaluateAll((els) => {
        let best: { z: number; src: string } | null = null;
        for (const el of els) {
          const s = getComputedStyle(el);
          if (Number(s.opacity) < 0.5) continue;
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const z = Number(s.zIndex) || 0;
          const src = (el as HTMLVideoElement).currentSrc || (el as HTMLImageElement).src || '';
          if (!src) continue;
          if (!best || z > best.z) best = { z, src };
        }
        if (!best) return null;
        return decodeURIComponent(best.src.split('/').pop() ?? '') || null;
      })
      .catch(() => null);
  }

  /**
   * Sample the player and return the ordered sequence of frame CHANGES.
   *
   * Consecutive duplicates are collapsed, so the result is the playback order
   * rather than a poll log: sampling every 250ms for 40s yields ~160 reads but
   * only the handful of transitions that actually happened. Assertions are then
   * written against playback order and are immune to sampling jitter.
   */
  async sampleSequence(durationMs: number, intervalMs = 250): Promise<PreviewFrame[]> {
    const started = Date.now();
    const seq: PreviewFrame[] = [];
    while (Date.now() - started < durationMs) {
      const file = await this.visibleFile();
      if (file && seq.at(-1)?.file !== file) {
        seq.push({ file, at: Date.now() - started });
      }
      await this.page.waitForTimeout(intervalMs);
    }
    return seq;
  }

  /**
   * Successive appearances of a campaign's own files, in the order the player
   * showed them — the sequence CP-LOOP-001/002 assert against.
   *
   * `campaignFiles` is the campaign's file list from /campaign/read; anything else
   * in the sequence (the zone's plain slides) is filtered out, because a campaign
   * advances once per LOOP PASS and the plain slides in between are exactly what
   * separates one pass from the next.
   */
  static campaignFrames(seq: PreviewFrame[], campaignFiles: string[]): string[] {
    const owned = new Set(campaignFiles);
    return seq.map((f) => f.file).filter((f) => owned.has(f));
  }

  /**
   * `count` files of `files` in cyclic order, starting from `firstShown`.
   *
   * Sampling never begins on file 1: the player boots, and `waitForFirstFrame`
   * costs seconds, so by the first sample the campaign has usually already
   * advanced. Asserting `[file1, file2, file3, file4]` therefore fails on a loop
   * that is working perfectly and merely started at file 2 — which is exactly what
   * CP-LOOP-004 hit. What the PRD actually requires is that successive appearances
   * follow the file list CYCLICALLY, wherever observation happens to start.
   *
   * This still catches every real defect: a skipped index, a repeated file, a
   * counter that resets, or the wrong order all diverge from the expected cycle.
   */
  static expectedCycle(files: string[], firstShown: string, count: number): string[] {
    const start = files.indexOf(firstShown);
    if (start < 0) {
      throw new Error(
        `"${firstShown}" is not one of the campaign's files (${files.join(', ')}) — ` +
          'the frame reader picked up something outside the campaign.',
      );
    }
    return Array.from({ length: count }, (_, i) => files[(start + i) % files.length]);
  }

  async close(): Promise<this> {
    await this.modal
      .locator('#closepreviewPlaylist')
      .click()
      .catch(() => undefined);
    return this;
  }
}

export default PlaylistPreviewPage;
