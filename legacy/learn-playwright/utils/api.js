// Helpers for API-level testing. The backend authorizes with a Bearer JWT that
// the app stores in the `footprint` cookie. We read that cookie out of the saved
// storageState so `request` calls can send `Authorization: Bearer <token>`.
import fs from 'fs';
import { API_BASE } from '../config.js';

// Pull the JWT out of .auth/state.json (written by auth.setup.js).
export function tokenFromStorageState(statePath = '.auth/state.json') {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const cookie = (state.cookies || []).find(c => c.name === 'footprint');
  if (!cookie) throw new Error('footprint cookie not found — run the setup project first');
  return cookie.value;
}

// Standard auth headers for the `request` fixture.
export function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Build a valid create payload (both zones use images).
export function mediaSetPayload({ name, folderId, landscape, portrait, overrides = {} }) {
  return {
    name,
    description: 'created by learn-playwright',
    type: 'orientation',
    portraitFile: portrait,
    landscapeFile: landscape,
    zones: [
      { ratio: '16:9', w: 16, h: 9, label: 'Landscape', file: landscape },
      { ratio: '9:16', w: 9, h: 16, label: 'Portrait', file: portrait },
    ],
    folderId,
    ...overrides,
  };
}

// Fetch a landscape + portrait image id fresh (use if the hardcoded ones expire).
export async function listImageFiles(request, token) {
  const res = await request.get(
    `${API_BASE}/file/read?limit=100&page=1&type=image&sort=createdAt&order=-1&folderId=`,
    { headers: authHeaders(token) },
  );
  const { docs = [] } = await res.json();
  return {
    landscape: docs.find(f => f.w > f.h),
    portrait: docs.find(f => f.h > f.w),
  };
}
