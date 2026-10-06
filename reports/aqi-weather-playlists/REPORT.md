c# AQI / Weather widgets in existing playlist "Aqi" — 2026-10-05

Env: cms.pocsample.in. Player: Android box 192.168.0.169:5555, playing playlist "Aqi" (the only one assigned to a screen).
Google references taken in the user's Chrome (headless Google hit a CAPTCHA, not bypassed). Weather tolerance: ±2 °C.

## Inventory (all 50 playlists scanned: 133 placements, 23 distinct widgets; full list in inventory.json)
| Playlist | Layout | Widget (id) | Type | Cities | Duration |
|---|---|---|---|---|---|
| Aqi | 1 | aqi1 (6abe3cfa36f9ebeed640c15b) | AQI | Hyderabad, Chennai, Kolkata, Telangana (aqiFor=pm25) | 10s (layout 15s) |
| Aqi | 2 | w1 (6abe3cac36f9ebeed640c138) | Weather | Mumbai, New Delhi, Chennai, Kolkata | 10s (layout 15s) |
| Aqi | 3 | sk (6ac324a9d31a3a150b5fce3b) | Weather | Pune, Mumbai, Indore, Chennai | 10s (layout 23s) |

## Results
| Playlist | Widget | City | Google Value | Widget Value | Timestamp (IST) | Result |
|---|---|---|---|---|---|---|
| Aqi | AQI | Hyderabad | 108 Poor (AQI.in); other sources 69–115 | 81 "Healthy" | 16:14 / 16:3x | FAIL |
| Aqi | AQI | Chennai | 76–110 range; AQI.in 101 | 74 "Healthy" | 16:14 / 16:3x | FAIL (below range) |
| Aqi | AQI | Kolkata | 193 Poor (Google panel); AQI.in 165 | 121 "Healthy" | 16:14 / 16:3x | FAIL |
| Aqi | AQI | Telangana | no state value; stations 106–155 | 62 "Healthy" | 16:14 / 16:3x | FAIL |
| Aqi | Weather | Mumbai | 34°C Sunny, wind 10 km/h | 33°C Clear, wind 5 | 16:14 / 16:2x | PASS (temp) |
| Aqi | Weather | New Delhi | 36°C Sunny, hum 49%, wind 11 | 35°C Clear, wind 3 | 16:14 / 16:2x | PASS (temp) |
| Aqi | Weather | Chennai | 33°C Sunny, wind 14 | 32°C Clear, wind 4 | 16:14 / 16:2x | PASS (temp) |
| Aqi | Weather | Kolkata | 34°C Sunny | 33°C Clear, wind 1 | 16:14 / 16:2x | PASS (temp) |
| Aqi | Weather | Pune | 33°C Sunny, hum ~41–53% | 32°C Clear | 16:14 / 16:2x | PASS (temp) |
| Aqi | Weather | Indore | not collected | 33°C | — | NOT VERIFIED |

Other 47 playlists / 20 widgets: inventoried, not value-tested (scope = "Aqi" playlist only).
Google has no AQI card for these queries; it shows a different number per source, so "exact" AQI parity cannot be established from Google alone.

## Playback (≈32 s window sampled, 18 frames, loop-contact-sheet.png)
- Loops Weather(Pune..) -> Weather(Mumbai..) -> AQI -> repeat: PASS. No stuck loading or wrong city; AQI values identical across loops.
- 1 fully black frame (f04, 16:14:02) at a layout transition: observed, likely transition gap, needs a repeat to confirm.
- Not tested: CMS restart / refresh staleness.

## Defects
1. **[AQI/Weather] Existing playlist widget displays incorrect data for Kolkata** (also Hyderabad, Chennai, Telangana). Expected: current AQI for the configured location. Actual: widget 121 vs Google 193 (AQI.in 165); Hyderabad 81 vs 108; Chennai 74 vs 76–110; Telangana 62 vs 106–155. Widget is configured aqiFor=pm25.
2. **AQI category label wrong**: every value is labelled "Healthy", including 121 (Kolkata) which is not Healthy on any scale.
3. **Weather widget shows identical sunrise and sunset time** (Mumbai 06:30/06:30, New Delhi 06:16/06:16, Chennai 05:58/05:58, Kolkata 05:29/05:29).
4. Weather wind value has no unit and is lower than Google (5 vs 10 km/h Mumbai; 3 vs 11 Delhi) — looks like m/s or a different source; minor.
5. Forecast strip: Chennai tile text wraps ("Tue 31 °C") and the last tile clips on the right.

Screenshots: shots/dev-now.png, shots/loop-contact-sheet.png, shots/seq/f*.png (device); Google reference screenshots only in Chrome session (not saved to disk).

## API check — GET v3-5api.pocsample.in/v3/cms/widget/readPublic/{widgetId} (2026-10-05, ~16:40 IST)
- All 3 widgets: HTTP 200, 0.65–0.79 s, 1.2–3.5 KB. Works with no auth header (same exposure as AUTOLOGIN note; config echoed back incl. folderId).
- **Widget config changed since the inventory (not by this test; no writes were made):** aqi1 now has cities Hyderabad, "7700 Cody Ln", Kolkata, Telangana (Chennai replaced by a Texas street address, coords 32.99,-96.57) and aqiFor=pm10 (was pm25).
- AQI payload: Hyderabad 81, 7700 Cody Ln 51, Kolkata 123, Telangana 62 (pm25/pm10 given; no category, no timestamp). Values match what the device displayed (81/121/62), so the mismatch with Google is in the data source, not the player.
- Weather payload: sunrise "06:30" and sunset "18:23" are CORRECT in the API (Mumbai). The device shows 06:30 for both, so the sunrise=sunset defect is a player/widget rendering bug, not an API bug.
- Weather payload has no feels_like, no wind unit; wind.speed Mumbai 5, humidity 60 (Google 10 km/h, ~66%).
- Defect 3: API returns correct, different sunrise/sunset, so the fault is downstream (widget page or player); not yet traced to the exact line.
