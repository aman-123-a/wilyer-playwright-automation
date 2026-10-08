// TC-D01..D07, TC-E01..E13, special characters, XSS, unicode — API-level validation plus one UI render check.
// No maximum name length is configured on this build (API-D2: 300 chars are stored), so the boundary
// cases do NOT assume 50: they assert a controlled answer (never 5xx), an exact round-trip (no silent
// truncation that could turn two distinct names into a duplicate) and a consistent verdict at each edge.
import { test, expect } from '../../../../fixtures/test-fixtures';
import { MediaSetService, type ZoneFiles } from '../../../../api';
import { MEDIASET_PREFIX, mediaSetName } from '../../../../test-data/mediasets.data';
import { MediaSetsPage } from '../../../../pages/MediaSetsPage';

test.describe.configure({ mode: 'serial' });

const P = MEDIASET_PREFIX + 'val_';
let files: ZoneFiles;
const strays: string[] = [];

test.beforeEach(async ({ mediaSetApi }) => {
  files ??= await mediaSetApi.pickZoneFiles();
});

test.afterAll(async () => undefined);

/** Create and remember the id even when the name does not carry the sweep prefix. */
async function tryCreate(api: MediaSetService, name: string, extra: Record<string, unknown> = {}) {
  const res = await api.createRaw({ ...MediaSetService.payload(name, files), ...extra });
  if (res.status() === 201) strays.push((await res.json()).id);
  return res;
}

/** A name of exactly `len` characters that still starts with the sweep prefix. */
const nameOfLength = (len: number, tag: string) => (P + tag + '_').padEnd(len, 'x').slice(0, Math.max(len, 0));

test.describe('TC-D01..D04 blank / whitespace-only names', () => {
  const cases: Array<[string, string]> = [
    ['TC-D01 empty', ''],
    ['TC-D02 spaces only', '     '],
    ['TC-D03 tabs only', '\t\t\t'],
    ['TC-D04 newline only', '\n\n'],
    ['mixed whitespace', ' \t\n \r\n'],
    ['non-breaking spaces', '   '],
  ];
  for (const [id, name] of cases) {
    test(`${id}: create is rejected with a 4xx and creates nothing`, async ({ mediaSetApi }) => {
      const before = (await mediaSetApi.list({ limit: 1 })).totalDocs;
      const res = await tryCreate(mediaSetApi, name);
      expect(res.status(), 'controlled 4xx').toBeGreaterThanOrEqual(400);
      expect(res.status()).toBeLessThan(500);
      expect((await mediaSetApi.list({ limit: 1 })).totalDocs, 'no partial resource').toBe(before);
    });
  }
});

test.describe('TC-D05..D07 duplicates', () => {
  test('exact / different-case / padded duplicate names are all 409 and only one set exists', async ({ mediaSetApi }) => {
    const base = mediaSetName('val_dup', 0);
    const first = await tryCreate(mediaSetApi, base);
    expect(first.status()).toBe(201);
    for (const [label, variant] of [
      ['TC-D05 exact', base],
      ['TC-D06 upper-case', base.toUpperCase()],
      ['TC-D06 lower-case', base.toLowerCase()],
      ['TC-D07 leading space', ' ' + base],
      ['TC-D07 trailing space', base + ' '],
      ['TC-D07 both', '  ' + base + '  '],
    ] as const) {
      const r = await tryCreate(mediaSetApi, variant);
      expect(r.status(), label).toBe(409);
    }
    const hits = (await mediaSetApi.list({ search: base, limit: 100 })).mediaSets.filter(
      (m) => m.name.trim().toLowerCase() === base.toLowerCase(),
    );
    expect(hits, 'exactly one set exists').toHaveLength(1);
  });

  test('TC-D16/D17 parallel identical creates produce exactly one resource', async ({ mediaSetApi }) => {
    const name = mediaSetName('val_race', 0);
    const results = await Promise.all(Array.from({ length: 6 }, () => tryCreate(mediaSetApi, name)));
    const codes = results.map((r) => r.status()).sort();
    expect(codes.filter((c) => c === 201), `statuses ${codes}`).toHaveLength(1);
    expect(codes.every((c) => c < 500)).toBe(true);
    const hits = (await mediaSetApi.list({ search: name, limit: 100 })).mediaSets.filter((m) => m.name === name);
    expect(hits).toHaveLength(1);
  });
});

test.describe('TC-E name length BVA (no configured cap)', () => {
  for (const len of [1, 2, 49, 50, 51, 52, 100, 255, 256, 1000]) {
    test(`TC-E ${len} chars: controlled answer, exact round-trip, no truncation`, async ({ mediaSetApi }) => {
      const name = nameOfLength(Math.max(len, (P + 'len_').length + 1), `len${len}`);
      const res = await tryCreate(mediaSetApi, name);
      expect(res.status(), `${name.length}-char name`).toBeLessThan(500);
      if (res.status() === 201) {
        const stored = await mediaSetApi.findByName(name);
        expect(stored?.name, 'stored value must equal what was sent').toBe(name);
      } else {
        expect([400, 409, 413, 422]).toContain(res.status());
      }
    });
  }

  test('TC-E near-identical long names stay distinct (no truncation-induced duplicate)', async ({ mediaSetApi }) => {
    const stem = nameOfLength(300, 'trunc');
    const a = await tryCreate(mediaSetApi, stem + 'A');
    const b = await tryCreate(mediaSetApi, stem + 'B');
    if (a.status() === 201) expect(b.status(), 'second name differs only after char 300').toBe(201);
  });

  test('TC-E01 zero-length name rejected; description boundary 0/1/1000/5000 never 5xx and round-trips', async ({ mediaSetApi }) => {
    expect((await tryCreate(mediaSetApi, '')).status()).toBeGreaterThanOrEqual(400);
    for (const len of [0, 1, 1000, 5000]) {
      const name = mediaSetName(`val_desc${len}`, 0);
      const desc = 'd'.repeat(len);
      const r = await tryCreate(mediaSetApi, name, { description: desc });
      expect(r.status(), `description ${len}`).toBeLessThan(500);
      if (r.status() === 201) expect((await mediaSetApi.findByName(name))?.description).toBe(desc);
    }
  });
});

test.describe('special characters and encodings round-trip', () => {
  const specials = ['@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '+', '=', '.', ',', '/', '\\', ':', ';', "'", '"', '<', '>', '?', '|', '{', '}', '[', ']', '~', '`'];
  test('every punctuation character is stored and searchable verbatim', async ({ mediaSetApi }) => {
    const bad: string[] = [];
    for (const ch of specials) {
      const name = `${P}sp_${specials.indexOf(ch)}_${ch}_${Date.now() % 100000}`;
      const r = await tryCreate(mediaSetApi, name);
      if (r.status() >= 500) { bad.push(`${ch}→${r.status()}`); continue; }
      if (r.status() === 201) {
        const got = await mediaSetApi.findByName(name);
        if (got?.name !== name) bad.push(`${ch}→stored "${got?.name}"`);
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  const unicode: Array<[string, string]> = [
    ['Hindi', 'मीडिया सेट'],
    ['Arabic', 'مجموعة الوسائط'],
    ['Japanese', 'メディアセット'],
    ['Emoji', 'Media 📺 Set'],
    ['Mixed', 'Media मीडिया 📺 Set'],
  ];
  for (const [label, text] of unicode) {
    test(`TC-C09 ${label}: saved, listed and searchable without encoding corruption`, async ({ mediaSetApi }) => {
      const name = `${P}uni_${text}_${Date.now() % 100000}`;
      const r = await tryCreate(mediaSetApi, name, { description: text });
      expect(r.status()).toBe(201);
      const got = await mediaSetApi.findByName(name);
      expect(got?.name).toBe(name);
      expect(got?.description).toBe(text);
      const hits = (await mediaSetApi.list({ search: text, limit: 50 })).mediaSets.map((m) => m.name);
      expect(hits, 'search by the unicode text finds it').toContain(name);
    });
  }
});

test.describe('XSS — stored data is escaped, never executed', () => {
  const payloads = [
    '<script>window.__xss=1</script>',
    '<img src=x onerror=window.__xss=1>',
    '"><script>window.__xss=1</script>',
    'javascript:window.__xss=1',
    '<svg onload=window.__xss=1>',
  ];
  for (const [i, payload] of payloads.entries()) {
    test(`XSS #${i + 1} ${payload.slice(0, 28)}: API stores it inert and the UI renders it as text`, async ({ mediaSetApi, page }) => {
      const name = `${P}xss${i}_${payload}`;
      const r = await tryCreate(mediaSetApi, name, { description: payload });
      expect(r.status(), 'controlled answer').toBeLessThan(500);
      if (r.status() !== 201) return; // rejected at the door is also a pass
      const dialogs: string[] = [];
      page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
      const ms = new MediaSetsPage(page);
      await ms.open();
      await ms.search(`${P}xss${i}`);
      await page.waitForTimeout(1_500);
      const flag = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
      expect(flag, 'script executed').toBeUndefined();
      expect(dialogs, 'alert/confirm fired').toEqual([]);
      expect(await page.locator(`body img[src="x"], body svg[onload]`).count(), 'injected element exists in DOM').toBe(0);
    });
  }

  test('XSS in the SEARCH box is not reflected as markup', async ({ page }) => {
    const ms = new MediaSetsPage(page);
    await ms.open();
    await ms.search('"><img src=x onerror=window.__xss=1>');
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
});

test.describe('search inputs never crash the list endpoint', () => {
  const terms = ['zzzz_no_such_set_zzzz', '!@#$%^&*()', '.*', '[', '(', '\\', '"><script>1</script>', ' ', '   ', '', 'a'.repeat(5000), '%00', '💥'];
  for (const t of terms) {
    test(`search "${t.slice(0, 20).replace(/\n/g, '\\n')}" (${t.length} chars) → 200 or controlled 4xx`, async ({ mediaSetApi }) => {
      const r = await mediaSetApi.listRaw({ search: t, limit: 5 });
      expect(r.status(), 'no 5xx for any search text').toBeLessThan(500);
      if (r.status() === 200) {
        const body = await r.json();
        expect(Array.isArray(body.mediaSets)).toBe(true);
      }
    });
  }
});

test('cleanup: remove every set this spec created', async ({ mediaSetApi }) => {
  await mediaSetApi.cleanupByPrefix(P);
  for (const id of strays) await mediaSetApi.deleteQuietly(id);
});
