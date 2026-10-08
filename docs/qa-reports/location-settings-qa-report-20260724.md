# Location Settings — Data-Driven QA Report

- **Target (as instructed):** LIVE PRODUCTION — `https://cms.wilyersignage.com`
- **Screen under test:** `amanbe` — `/screen-settings/6a63365da13cefc64dab1615` (Online, playing playlist `n11`)
- **Path:** Screens → View Details → **Configurations** tab → scroll to **Location Settings**
- **Data source:** [Google Sheet — Location Setting test cases](https://docs.google.com/spreadsheets/d/1hUBjnDHaHRDzRq-3-rPXH1PzhhHMDltRGj0WlC1DQhI/edit) (16 cases, TC_LOC_001–016)
- **Date:** 2026-07-24
- **Executed by:** Automated browser session (Chromium). Account: `dev@wilyer.com`.
- **Safety:** No `Save Configurations` click was performed with test data. All edits were form-only and discarded on reload — verified the stored config reverted to originals. The live screen was **not mutated**.

## Structural finding (root cause for most failures)

Every Location Settings input — **including Longitude and Latitude** — is a plain
`<input type="text">` with `maxLength = -1` and **no** `min` / `max` / `pattern` /
`required` attribute. There is therefore **zero HTML-level validation**, and no
on-input or on-blur JS validation was observed either. This is the root cause
behind the boundary, pincode, max-length and empty-field findings below.

Corroborating evidence found live on the screen **before any test input**:
- `Country = "austrail"` (misspelled / invalid)
- `Area (Pincode) = "122003 hh"` (letters in a postal-code field)

Both were already **saved** on a live screen — proving invalid data persists in production today.

## Results summary

| TC | Scenario | Priority | Result | Notes |
|----|----------|----------|--------|-------|
| TC_LOC_001 | Autocomplete & auto-fill | P1 | ✅ **PASS*** | Selecting a Google Places suggestion filled location/lon/lat/city/state/country/locality and re-centered the map. *Caveat: Pincode came back empty (Google returned no `postal_code` for "India Gate"). Also correctly overwrote the bad `country`. |
| TC_LOC_002 | Pin drag-and-drop sync | P1 | ⚠️ **NOT TESTED** | Marker lives inside a Google Maps `iframe`; drag not reliably automatable. Needs manual verification. |
| TC_LOC_003 | Manual Lat/Long map re-position | P2 | ❌ **FAIL** | Set lat `28.4336`, lon `77.0923`; map stayed at previous center (`28.611089,77.234518`). Map/marker does **not** follow manual coordinate edits (neither live nor on focus-out). |
| TC_LOC_004 | Map controls | P3 | ✅ **PASS (obs.)** | Google Maps embed with zoom/camera controls, keyboard shortcuts, "Open in Google Maps" present and rendering. Not stress-tested. |
| TC_LOC_005 | Latitude boundary (−90/90/90.00000001) | P1 | ❌ **FAIL** | `90.00000001` (>90) accepted, no error, no `aria-invalid`. No range enforcement. |
| TC_LOC_006 | Longitude boundary (−180/180/181) | P1 | ❌ **FAIL** | `181.0000` (>180) accepted, no error. No range enforcement. |
| TC_LOC_007 | Pincode strict validation | P2 | ❌ **FAIL** | `ABC@#$xyz` accepted. Field is free text; existing saved value `122003 hh` also invalid. |
| TC_LOC_008 | Field max length (>255) | P3 | ❌ **FAIL** | 289-char string accepted intact, no truncation, no error. |
| TC_LOC_009 | Special char / XSS / SQLi | P1 | ⚠️ **CONCERN** | `<script>alert('xss-loc')</script>` accepted raw into City with no input sanitization. No script executed this session (React escapes on render), but input-side sanitization/validation is absent. Recommend server-side sanitization + confirm no unescaped reflection on player/report surfaces. |
| TC_LOC_010 | Empty required fields + Save | P1 | ⚠️ **NOT TESTED** | No `required` attribute on any field. Not saved (would mutate live). Strongly suspect empty save is allowed — verify on staging. |
| TC_LOC_011 | Ocean / 0,0 | P2 | ⚠️ **PARTIAL** | Fields accept `0,0`; but per TC_003 the map does not follow manual coords, so graceful-geocode behavior on save was not exercised. Verify on staging. |
| TC_LOC_012 | Map API failure / offline | P2 | ⚠️ **NOT TESTED** | Requires network blocking. Note: a manual Lat/Long fallback path exists in the UI. |
| TC_LOC_013 | Mismatched geolocation data | P2 | ❌ **FAIL (pre-existing)** | Screen already stores India coordinates with `country = "austrail"`. No cross-validation between coordinates and address fields. |
| TC_LOC_014 | Persistence on save + refresh | P1 | ⚠️ **NOT TESTED** | Requires a Save against a live screen — deliberately skipped to avoid mutation. Run on staging. |
| TC_LOC_015 | CMS → device sync | P1 | ⚠️ **NOT TESTED** | Requires Save + a physical player. Out of scope for a read-only live pass. |
| TC_LOC_016 | Cross-browser & responsive | P3 | ❌ **FAIL (partial)** | At 768px (tablet portrait) the page overflows horizontally; Location section right edge 924px > 768px viewport. Only Chromium exercised this session. |

**Executed verdicts:** 2 PASS, 6 FAIL, 1 CONCERN, 7 not-tested (require destructive Save, a physical device, iframe drag, or network fault injection — all out of scope for a non-mutating live pass).

## Top defects (recommend logging)

1. **[P1] No numeric range validation on Latitude/Longitude** (TC_005/006). Out-of-range values (`>90`, `>180`) are accepted silently. Add `[-90,90]` / `[-180,180]` validation with inline errors.
2. **[P1] No input sanitization** (TC_009). Raw `<script>`/SQL payloads accepted. Add sanitization/validation; audit all render surfaces for the stored value.
3. **[P1] Autocomplete does not populate Pincode** for places lacking `postal_code` (TC_001) — leaves Pincode blank silently.
4. **[P2] Manual coordinates don't move the map** (TC_003) — one-way display; users can't reposition via lat/long.
5. **[P2] Pincode accepts non-numeric/free text** (TC_007) — live data already corrupted (`122003 hh`).
6. **[P2] No coordinate↔address cross-validation** (TC_013) — live example: India coords + `country="austrail"`.
7. **[P3] No max-length enforcement** (TC_008) and **tablet layout overflow** (TC_016).

## Recommended next steps

- Re-run TC_010/011/014/015 on **staging** (`cms.pocsample.in`) where Save is safe, to confirm whether server-side validation exists at persistence time.
- Automate the non-destructive subset via `cms-e2e/tests/screens/location-settings.spec.ts` (added) driven by `cms-e2e/data/location-settings.data.ts`.
