// ─────────────────────────────────────────────────────────────────────────────
// LESSON 3 — API testing with the `request` fixture. Fast, deterministic, and
// perfect for CRUD + boundary + negative cases (no UI flakiness).
// Teaches: request fixture, auth headers, full CRUD, and documenting a known bug
// with test.fail() so the suite goes RED the day the bug is fixed.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from '@playwright/test';
import { API_BASE, NOIDA_FOLDER_ID, SAMPLE_FILES } from '../config.js';
import { tokenFromStorageState, authHeaders, mediaSetPayload } from '../utils/api.js';

let token;
test.beforeAll(() => {
  token = tokenFromStorageState('.auth/state.json');
});

test.describe('Lesson 3 · Media Sets API', () => {
  test('full CRUD: create → read → update → delete', async ({ request }) => {
    const name = `LP_API_${Date.now()}`;
    const payload = mediaSetPayload({
      name,
      folderId: NOIDA_FOLDER_ID,
      landscape: SAMPLE_FILES.landscape,
      portrait: SAMPLE_FILES.portrait,
    });

    // CREATE → 201
    const created = await request.post(`${API_BASE}/mediaSet/create`, {
      headers: authHeaders(token),
      data: payload,
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    expect(id).toBeTruthy();

    // READ (search folder-scoped) → find our set
    const read = await request.get(
      `${API_BASE}/mediaSet/read?page=1&limit=20&search=${name}&folderId=${NOIDA_FOLDER_ID}`,
      { headers: authHeaders(token) },
    );
    expect(read.status()).toBe(200);
    const { totalDocs } = await read.json();
    expect(totalDocs).toBe(1);

    // UPDATE (rename) → 200
    const updated = await request.post(`${API_BASE}/mediaSet/update/${id}`, {
      headers: authHeaders(token),
      data: { ...payload, name: `${name}_edited` },
    });
    expect(updated.status()).toBe(200);

    // DELETE → 200 (also cleans up after ourselves)
    const deleted = await request.delete(`${API_BASE}/mediaSet/delete/${id}`, {
      headers: authHeaders(token),
    });
    expect(deleted.status()).toBe(200);
  });

  test('empty name is rejected with 400', async ({ request }) => {
    const res = await request.post(`${API_BASE}/mediaSet/create`, {
      headers: authHeaders(token),
      data: mediaSetPayload({
        name: '', folderId: NOIDA_FOLDER_ID,
        landscape: SAMPLE_FILES.landscape, portrait: SAMPLE_FILES.portrait,
      }),
    });
    expect(res.status()).toBe(400);
  });

  test('a non-existent file id is rejected with 400', async ({ request }) => {
    const res = await request.post(`${API_BASE}/mediaSet/create`, {
      headers: authHeaders(token),
      data: mediaSetPayload({
        name: `LP_badfile_${Date.now()}`, folderId: NOIDA_FOLDER_ID,
        landscape: '000000000000000000000000', portrait: SAMPLE_FILES.portrait,
      }),
    });
    expect(res.status()).toBe(400);
  });

  // ── KNOWN BUG (ClickUp 86d3n51bv) ───────────────────────────────────────────
  // A malformed folderId should return 400, but the server currently 500s
  // (uncaught CastError). test.fail() marks this as an EXPECTED failure: the
  // suite stays green while the bug exists, and turns RED (alerting you) the day
  // it's fixed so you can delete this marker.
  test('malformed folderId should be 400, not 500', async ({ request }) => {
    test.fail(); // remove once the bug is fixed
    const res = await request.post(`${API_BASE}/mediaSet/create`, {
      headers: authHeaders(token),
      data: mediaSetPayload({
        name: `LP_malfolder_${Date.now()}`, folderId: 'not-an-objectid',
        landscape: SAMPLE_FILES.landscape, portrait: SAMPLE_FILES.portrait,
      }),
    });
    expect(res.status()).toBe(400);
  });
});
