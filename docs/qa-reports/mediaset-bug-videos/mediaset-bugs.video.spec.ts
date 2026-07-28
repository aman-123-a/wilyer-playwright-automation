import { test, expect, Page } from '@playwright/test';

/**
 * Video evidence of two Media Sets defects on cms2.pocsample.in (v3.5.20):
 *   F2 — Aspect-ratio filter is orientation-based, not ratio-based. A 2760x3320
 *        (~5:6, ratio 0.83) portrait file is accepted into the "9:16" (0.56) slot.
 *   F1 — The "N of 835" file counter desyncs from the active filters.
 *
 * On-screen captions are injected so the video is self-explanatory (native
 * title-attribute tooltips do not render in headless recordings).
 */

const EMAIL = process.env.CMS_EMAIL || (process.env.CMS_EMAIL || process.env.CMS_ADMIN_EMAIL || '');
const PASSWORD = process.env.CMS_PASSWORD || (process.env.CMS_PASSWORD || process.env.CMS_ADMIN_PASSWORD || '');

async function caption(page: Page, kind: 'F2' | 'F1' | 'info', title: string, lines: string[] = [], holdMs = 2200) {
  await page.evaluate(({ kind, title, lines }) => {
    const colors: Record<string, string> = { F2: '#ef4444', F1: '#f59e0b', info: '#3b82f6' };
    let el = document.getElementById('__qa_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__qa_caption';
      Object.assign(el.style, {
        position: 'fixed', left: '0', right: '0', top: '0', zIndex: '2147483647',
        background: 'rgba(2,6,23,0.94)', color: '#fff', padding: '10px 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 2px 14px rgba(0,0,0,.5)',
      });
      document.body.appendChild(el);
    }
    el.style.borderBottom = `4px solid ${colors[kind]}`;
    const tag = kind === 'info' ? '' : `<span style="background:${colors[kind]};padding:1px 8px;border-radius:5px;margin-right:8px;font-size:15px">${kind}</span>`;
    el.innerHTML =
      `<div style="font-size:19px;font-weight:700;display:flex;align-items:center">${tag}${title}</div>` +
      lines.map(l => `<div style="font-size:14px;font-weight:400;margin-top:3px;color:#cbd5e1">— ${l}</div>`).join('');
  }, { kind, title, lines });
  await page.waitForTimeout(holdMs);
}

async function highlight(page: Page, selectorText: string) {
  await page.evaluate((txt) => {
    document.querySelectorAll('[data-qa-hl]').forEach(n => {
      (n as HTMLElement).style.outline = '';
      n.removeAttribute('data-qa-hl');
    });
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .filter(n => n.children.length === 0 && n.textContent?.trim() === txt);
    const target = nodes[0]?.closest('div');
    if (target) {
      target.setAttribute('data-qa-hl', '1');
      target.style.outline = '3px solid #22d3ee';
      target.style.outlineOffset = '2px';
      target.scrollIntoView({ block: 'center' });
    }
  }, selectorText);
  await page.waitForTimeout(400);
}

test('Media Sets — F2 aspect-ratio filter & F1 counter desync', async ({ page }) => {
  test.setTimeout(180_000);

  // --- Login ---
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Enter your email or phone' }).fill(EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log In' }).click();
  // Wait for the authenticated app shell (sidebar) rather than a URL that
  // matches the login page too. Retry the submit once if auth is slow.
  const loggedIn = page.getByRole('link', { name: /Screens/ }).first();
  try {
    await loggedIn.waitFor({ state: 'visible', timeout: 25_000 });
  } catch {
    await page.getByRole('button', { name: 'Log In' }).click();
    await loggedIn.waitFor({ state: 'visible', timeout: 30_000 });
  }
  await page.waitForTimeout(1500);

  // --- Open Library > Media Sets > Create ---
  await page.goto('/library');
  await page.getByRole('link', { name: 'Media Sets' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Create Media Set/ }).click();
  await expect(page).toHaveURL(/mediaset\/create/);
  await page.getByText('Display Formats').waitFor();
  await page.waitForTimeout(1000);

  await caption(page, 'info',
    'Library › Media Sets › Create — Aspect Ratio filter + orientation enforcement',
    ['Two default display formats: Landscape · 16:9 (active) and Portrait · 9:16'], 2600);

  // --- F2 setup: show tooltip claim while 16:9 is active ---
  await highlight(page, 'Aspect Ratio');
  await caption(page, 'F2',
    'The Aspect Ratio control claims to filter by exact ratio',
    ['Its tooltip reads: "Show files matching 16:9" (title attribute)',
     'Claim: it shows only files whose aspect ratio matches the active format'], 2800);

  // Activate Portrait · 9:16
  await page.getByText('Portrait · 9:16', { exact: true }).click();
  await page.waitForTimeout(600);
  await caption(page, 'F2',
    'Made Portrait · 9:16 the active format',
    ['Tooltip now reads "Show files matching 9:16" — 9:16 = ratio 0.5625'], 2600);

  // Enable the Aspect Ratio filter
  await page.getByText('Aspect Ratio', { exact: true }).click();
  await page.getByText('Showing only 9:16 media', { exact: false }).waitFor();
  await page.waitForTimeout(600);
  await highlight(page, 'IMAGE · 0.93MB · 2760×3320');
  await caption(page, 'F2',
    'Banner says "Showing only 9:16 media" — but this file is NOT 9:16',
    ['2760 × 3320  →  ratio 0.83 (~5:6), not 9:16 (0.5625)',
     'The filter is orientation-based (any portrait), not ratio-based'], 3200);

  // Assign the non-9:16 portrait file into the 9:16 slot
  await page.locator('.msce-file-tile', { hasText: '2760×3320' }).first().click();
  await page.waitForTimeout(800);
  await caption(page, 'F2',
    'The 2760×3320 (~5:6) file was ACCEPTED into the 9:16 slot',
    ['No warning. "In set" badge appears; the file fills the 9:16 zone',
     'Consequence: it will be letterboxed / distorted on a real 9:16 screen'], 3600);
  await page.screenshot({ path: 'artifacts/F2-nonratio-file-in-9x16-slot.png' });

  // --- F1: counter desync ---
  await highlight(page, '24 of 835');
  await caption(page, 'F1',
    'File counter is out of sync with the active filter',
    ['Only 2 files are shown after filtering, yet the counter reads "24 of 835"'], 3200);

  // Add a text search for a landscape-only name -> 0 results, counter still stale
  await page.getByRole('textbox', { name: 'Search files...' }).fill('image_3');
  await page.waitForTimeout(1500);
  await caption(page, 'F1',
    'Portrait filter + search "image_3" (a landscape file) → 0 files shown',
    ['Intersection is empty, but the counter does not reflect the real visible count',
     'The counter reports a stale/earlier filter state — untrustworthy'], 3600);
  await page.screenshot({ path: 'artifacts/F1-counter-desync.png' });

  await caption(page, 'info', 'End of evidence — F2 (functional: mismatched file reaches playout) + F1 (counter desync)', [], 2600);
});
