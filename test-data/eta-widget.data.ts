// =============================================================================
//  Live ETA Widget test data.
//
//  Verified live against cms.wilyersignage.com (CMS v3.5.25) on 2026-08-04 by
//  creating, editing and deleting a real widget and capturing the wire traffic.
//
//  ── Ground truth (do NOT re-guess these) ────────────────────────────────────
//  Widget type discriminator ......... type: 'liveEta'
//  Library path ...................... Library → Widgets → "Live ETA" tile
//  Create modal ...................... #createWidget      (Bootstrap modal)
//  Edit modal ........................ #updateWidget
//  Delete modal ...................... #deleteModal
//  Configurable fields ............... Widget Name, Pickup Location,
//                                      Destination 1..N (+ optional custom name)
//
//  ── Fields that DO NOT EXIST in the product ─────────────────────────────────
//  There is no transport mode, no refresh interval, no units toggle, no traffic
//  model and no threshold configuration.  Earlier revisions of this file
//  modelled those; they were speculative.  Boundary data for them is kept below
//  under NOT_IMPLEMENTED purely so the gap is visible in review — nothing
//  consumes it, and no test asserts on it.
// =============================================================================

/** Every ETA widget artefact carries this prefix — teardown keys off it. */
export const ETA_PREFIX = 'QA_ETA_';

/** The API's discriminator for this widget type. */
export const ETA_WIDGET_TYPE = 'liveEta';

/** Face image the CMS sends on create; the API stores it verbatim. */
export const ETA_FACE_URL = '/media/widgets/google-maps.png';
export const ETA_FACE_ID = 1;

/**
 * Collision-proof name. Parallel workers share one account, so worker index
 * and a random suffix are both required.
 */
export function etaUniqueName(label: string, workerIndex: number | string = 0): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${ETA_PREFIX}${label}_w${workerIndex}_${rand}`;
}

// ── Location shape the API actually persists ─────────────────────────────────
//
//  The CMS derives every field below from the Google Places result before
//  POSTing.  `remark` is a human-readable audit trail the CMS writes itself;
//  it is echoed back on read and is NOT required on create.

export interface EtaLocation {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  area?: string;
  country?: string;
  locality?: string;
  address: string;
  remark?: string;
}

export interface EtaPlace {
  location: EtaLocation;
  /** Optional operator-supplied label ("Custom name (optional)" in the UI). */
  name?: string;
}

export interface EtaWidgetPayload {
  name: string;
  data: {
    pickup: EtaPlace;
    destinations: EtaPlace[];
  };
  type: typeof ETA_WIDGET_TYPE;
  faceId: number;
  faceUrl: string;
  folderId?: string | null;
}

/** Build a place block from coordinates + an address string. */
export const place = (lat: number, lng: number, address: string, name?: string): EtaPlace => ({
  location: {
    lat,
    lng,
    city: 'New Delhi',
    state: 'Delhi',
    area: 'Delhi Division',
    country: 'India',
    locality: '',
    address,
  },
  ...(name ? { name } : {}),
});

// ── Known-good places (geocodable, stable, and reachable by road) ────────────
//
//  Delhi NCR is used because the reference account and its screens sit there,
//  so a live route always exists and the ETA is non-trivial (~40 min).

export const PLACES = {
  connaughtPlace: () =>
    place(28.6304203, 77.2177216, 'Connaught Place, New Delhi, Delhi 110001'),
  delhiAirport: () =>
    place(28.5561437, 77.0999623, 'Indira Gandhi International Airport, New Delhi, Delhi 110037'),
  gurugramCyberHub: () =>
    place(28.4949, 77.0894, 'DLF Cyber Hub, DLF Cyber City, Gurugram, Haryana 122002'),
  noidaSector18: () => place(28.5708, 77.3260, 'Sector 18, Noida, Uttar Pradesh 201301'),
  indiaGate: () => place(28.6129, 77.2295, 'India Gate, New Delhi, Delhi 110001'),
} as const;

/** Free-text queries for driving the Google Places autocomplete in the UI. */
export const PLACE_QUERIES = {
  pickup: 'Connaught Place, New Delhi',
  destination: 'Indira Gandhi International Airport',
  destination2: 'India Gate, New Delhi',
  /** Resolves to a place on another continent — used for no-route probes. */
  unreachable: 'Reykjavik, Iceland',
  /** Should return zero suggestions. */
  gibberish: 'zxqwvv12345 notaplace',
} as const;

/** A ready-to-POST valid payload. */
export const validEtaPayload = (name: string): EtaWidgetPayload => ({
  name,
  data: { pickup: PLACES.connaughtPlace(), destinations: [PLACES.delhiAirport()] },
  type: ETA_WIDGET_TYPE,
  faceId: ETA_FACE_ID,
  faceUrl: ETA_FACE_URL,
});

// ── Boundary data — widget name ──────────────────────────────────────────────
//
//  No documented cap exists.  These probe for one; the suite records what the
//  server actually does rather than asserting an invented limit.

export const ETA_NAMES = {
  blank: '',
  whitespace: '   ',
  single: 'A',
  at100: 'N'.repeat(100),
  at255: 'N'.repeat(255),
  over255: 'N'.repeat(256),
  huge: 'N'.repeat(5_000),
  leadingTrailingSpace: '  Padded ETA  ',
  /** XSS probe — must render as inert text on CMS *and* on the player. */
  xss: '<script>alert("xss")</script>',
  xssImg: '<img src=x onerror=alert(1)>',
  /** SQL injection probe — must be stored literally. */
  sqlish: "'; DROP TABLE widget;--",
  /** NoSQL operator injection — Mongo-backed API. */
  nosql: '{"$gt":""}',
  /** Template injection probe. */
  template: '${7*7} {{7*7}}',
  /** Path traversal probe. */
  traversal: '../../etc/passwd',
  /** Multi-script Unicode + emoji + RTL. */
  unicode: 'وقت الوصول 到达时间 ETA 🚗',
} as const;

// ── Boundary data — coordinates ──────────────────────────────────────────────
//
//  Latitude is valid on [-90, 90]; longitude on [-180, 180].  `valid: false`
//  means the API is expected to reject the payload with a 4xx.

export const COORD_BOUNDARIES: ReadonlyArray<{
  id: string;
  lat: number;
  lng: number;
  valid: boolean;
  note: string;
}> = [
  { id: 'lat-min', lat: -90, lng: 77.2, valid: true, note: 'latitude at lower edge' },
  { id: 'lat-max', lat: 90, lng: 77.2, valid: true, note: 'latitude at upper edge' },
  { id: 'lat-over', lat: 90.000001, lng: 77.2, valid: false, note: 'latitude max+1' },
  { id: 'lat-under', lat: -90.000001, lng: 77.2, valid: false, note: 'latitude min-1' },
  { id: 'lat-absurd', lat: 999, lng: 77.2, valid: false, note: 'latitude far out of range' },
  { id: 'lng-min', lat: 28.6, lng: -180, valid: true, note: 'longitude at lower edge' },
  { id: 'lng-max', lat: 28.6, lng: 180, valid: true, note: 'longitude at upper edge' },
  { id: 'lng-over', lat: 28.6, lng: 180.000001, valid: false, note: 'longitude max+1' },
  { id: 'lng-under', lat: 28.6, lng: -180.000001, valid: false, note: 'longitude min-1' },
  { id: 'lng-absurd', lat: 28.6, lng: 99_999, valid: false, note: 'longitude far out of range' },
  { id: 'zero-island', lat: 0, lng: 0, valid: false, note: 'null island — no route by road' },
] as const;

/** Coordinate values that are not numbers at all. */
export const MALFORMED_COORDS: ReadonlyArray<{ id: string; lat: unknown; lng: unknown }> = [
  { id: 'string-coords', lat: 'abc', lng: 'xyz' },
  { id: 'numeric-strings', lat: '28.6', lng: '77.2' },
  { id: 'null-coords', lat: null, lng: null },
  { id: 'nan-coords', lat: Number.NaN, lng: Number.NaN },
  { id: 'infinity-coords', lat: Number.POSITIVE_INFINITY, lng: Number.NEGATIVE_INFINITY },
  { id: 'object-coords', lat: { $gt: 0 }, lng: { $gt: 0 } },
] as const;

// ── Boundary data — destination cardinality ──────────────────────────────────
//
//  The UI imposes no visible cap on "+ Add destination"; these probe the API.

export const DESTINATION_COUNTS = {
  none: 0,
  one: 1,
  five: 5,
  ten: 10,
  fifty: 50,
  /** Payload-size / DoS probe. */
  fiveHundred: 500,
} as const;

// ── Fields the product does not implement ────────────────────────────────────
//
//  Retained only to make the coverage gap explicit in review. Nothing reads it.
//  If any of these ship, move them above and write real cases.

export const NOT_IMPLEMENTED = {
  transportModes: ['driving', 'walking', 'transit', 'bicycling'],
  refreshIntervalSeconds: { min: 30, max: 3_600 },
  displayUnits: ['km', 'miles'],
  trafficModels: ['best_guess', 'optimistic', 'pessimistic'],
  thresholdColouring: true,
  scheduledDeparture: true,
} as const;

export default {
  ETA_PREFIX,
  ETA_WIDGET_TYPE,
  etaUniqueName,
  PLACES,
  PLACE_QUERIES,
  validEtaPayload,
  ETA_NAMES,
  COORD_BOUNDARIES,
  MALFORMED_COORDS,
  DESTINATION_COUNTS,
};
