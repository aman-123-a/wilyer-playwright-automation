// =============================================================================
//  Location Settings — data-driven dataset.
//  Source: Google Sheet "Location Setting" test cases (TC_LOC_001–016).
//  Consumed by tests/screens/location-settings.spec.ts.
//
//  Screen Configuration → Location Settings verified live (2026-07-24) on
//  cms.wilyersignage.com. Every field is a plain <input type="text"> keyed by
//  its placeholder, so we locate by placeholder here.
// =============================================================================

/** Placeholder text for each Location Settings input (stable locator hook). */
export const LOCATION_FIELDS = {
  location: 'Enter a location',
  longitude: 'Enter longitude',
  latitude: 'Enter latitude',
  city: 'Enter city',
  state: 'Enter state',
  country: 'Enter country',
  area: 'Enter area', // "Area (Pincode)"
  locality: 'Enter locality',
} as const;

export type LocationField = keyof typeof LOCATION_FIELDS;

/** A single invalid-input row: value + why it should be rejected. */
export interface InvalidInputCase {
  tc: string;
  field: LocationField;
  value: string;
  reason: string;
}

/** TC_LOC_005 — Latitude must stay within [-90, 90]. */
export const LATITUDE_BOUNDARY: InvalidInputCase[] = [
  { tc: 'TC_LOC_005', field: 'latitude', value: '90.0000', reason: 'upper valid edge — should be accepted' },
  { tc: 'TC_LOC_005', field: 'latitude', value: '-90.0000', reason: 'lower valid edge — should be accepted' },
  { tc: 'TC_LOC_005', field: 'latitude', value: '90.00000001', reason: 'just above 90 — must be rejected' },
  { tc: 'TC_LOC_005', field: 'latitude', value: '-91', reason: 'below -90 — must be rejected' },
  { tc: 'TC_LOC_005', field: 'latitude', value: 'abc', reason: 'non-numeric — must be rejected' },
];

/** TC_LOC_006 — Longitude must stay within [-180, 180]. */
export const LONGITUDE_BOUNDARY: InvalidInputCase[] = [
  { tc: 'TC_LOC_006', field: 'longitude', value: '180.0000', reason: 'upper valid edge — should be accepted' },
  { tc: 'TC_LOC_006', field: 'longitude', value: '-180.0000', reason: 'lower valid edge — should be accepted' },
  { tc: 'TC_LOC_006', field: 'longitude', value: '181.0000', reason: 'above 180 — must be rejected' },
  { tc: 'TC_LOC_006', field: 'longitude', value: '-181', reason: 'below -180 — must be rejected' },
  { tc: 'TC_LOC_006', field: 'longitude', value: 'xyz', reason: 'non-numeric — must be rejected' },
];

/** TC_LOC_007 — Pincode/Area should reject non-standard postal characters. */
export const PINCODE_INVALID: InvalidInputCase[] = [
  { tc: 'TC_LOC_007', field: 'area', value: 'ABC@#$xyz', reason: 'letters + symbols in postal code' },
  { tc: 'TC_LOC_007', field: 'area', value: '12', reason: 'too short for an Indian PIN (6 digits)' },
  { tc: 'TC_LOC_007', field: 'area', value: '999999999999', reason: 'too long' },
  { tc: 'TC_LOC_007', field: 'area', value: '122003 hh', reason: 'trailing letters (mirrors live corrupted data)' },
];

/** TC_LOC_009 — Special-character / XSS / SQLi payloads for text fields. */
export const INJECTION_PAYLOADS: InvalidInputCase[] = [
  { tc: 'TC_LOC_009', field: 'city', value: `<script>alert('xss-loc')</script>`, reason: 'stored-XSS attempt' },
  { tc: 'TC_LOC_009', field: 'city', value: `'; DROP TABLE screens;--`, reason: 'SQL injection attempt' },
  { tc: 'TC_LOC_009', field: 'locality', value: `<img src=x onerror=alert(1)>`, reason: 'HTML-injection attempt' },
];

/** TC_LOC_008 — Fields should cap / validate very long input (>255 chars). */
export const MAX_LENGTH_CASE = {
  tc: 'TC_LOC_008',
  field: 'locality' as LocationField,
  value: 'A'.repeat(300),
  maxExpected: 255,
};

/** TC_LOC_001 — a valid place used to verify autocomplete + auto-fill. */
export const AUTOCOMPLETE_QUERY = {
  tc: 'TC_LOC_001',
  query: 'India Gate, New Delhi',
  expects: {
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    // lat/long re-centre the map; exact values come from Google Places.
  },
} as const;

/** TC_LOC_003 — manual coordinates that the map/marker should follow. */
export const MANUAL_COORDS = {
  tc: 'TC_LOC_003',
  latitude: '28.4336',
  longitude: '77.0923',
} as const;

/** TC_LOC_016 — viewports to check for responsive layout breaks. */
export const RESPONSIVE_VIEWPORTS = [
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
] as const;

export default {
  LOCATION_FIELDS,
  LATITUDE_BOUNDARY,
  LONGITUDE_BOUNDARY,
  PINCODE_INVALID,
  INJECTION_PAYLOADS,
  MAX_LENGTH_CASE,
  AUTOCOMPLETE_QUERY,
  MANUAL_COORDS,
  RESPONSIVE_VIEWPORTS,
};
