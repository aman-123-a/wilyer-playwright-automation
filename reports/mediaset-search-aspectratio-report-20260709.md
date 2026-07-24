# QA Report — Media Sets: Search Bar & Aspect-Ratio Filter

- **Target:** https://cms2.pocsample.in  →  Library ▸ **Media Sets**
- **Build:** v3.5.20
- **Login:** dev@wilyer.com
- **Date:** 2026-07-09
- **Tester:** Aman Kumar (automated via Playwright MCP / Chromium)
- **Scope:** (1) Media-Sets **list search bar** (`Search…`), (2) Create page **Aspect Ratio filter** + orientation enforcement, and their interaction with the in-create `Search files…` box.
- **Baseline data:** 5 media sets — `QA media` (2 files), `z`, `f`, `w`, `s`. File library = 835 files.

---

## 1. List Search Bar (`Search…`)  — 10 cases, all PASS

Signal measured: visible card count + `Total - N` header + empty-state text.

| # | Type | Input | Expected | Actual | Result |
|---|------|-------|----------|--------|--------|
| P1 | Positive | `z` | 1 match | 1 card, Total-1 | ✅ |
| P2 | Positive | `QA media` (exact) | 1 match | 1 card, Total-1 | ✅ |
| P3 | Positive (case) | `qa media` (lowercase) | 1 match (case-insensitive) | 1 card | ✅ |
| P4 | Positive (substring) | `media` | matches `QA media` | 1 card | ✅ |
| P5 | Positive (reset) | *(cleared)* | full list | 5 cards, Total-5 | ✅ |
| N1 | Negative | `zzznotfound123` | 0 + empty state | 0 cards; **"No media sets match \"zzznotfound123\""** | ✅ |
| N2 | Edge (trim) | `   QA media   ` (padded) | trims → 1 match | 1 card | ✅ |
| N3 | Edge (blank) | `     ` (spaces only) | treated as empty → all | 5 cards | ✅ |
| N4 | Security (XSS/HTML) | `<b>QAX</b>` | escaped, no injection | echoed as `&lt;b&gt;QAX&lt;/b&gt;` (escaped) | ✅ safe |
| N5 | Security (SQLi) | `' OR 1=1 --` | literal, no crash | 0 cards, literal echo, no error | ✅ safe |
| N6 | Boundary (length) | 600 × `A` | no crash | accepted, 0 cards, no crash | ⚠️ see F3 |

**Behaviour confirmed:** case-insensitive, substring (not prefix-only), query trimmed, blank = no filter, live-filter as you type (no Enter needed), `Total - N` header updates with results, dedicated empty-state message that echoes the (escaped) query.

---

## 2. Aspect-Ratio Filter (Create Media Set page) — 6 cases, all PASS

File browser starts in **Choose Any** = 24 shown (20 Landscape + 2 Portrait + 2 Square). Default formats: **Landscape · 16:9** (active) + **Portrait · 9:16**.

| # | Scenario | Action | Expected | Actual | Result |
|---|----------|--------|----------|--------|--------|
| AR-1 | Filter ON, 16:9 active | click **Aspect Ratio** | only landscape shown | 20 shown, **all Landscape**; P+S dropped | ✅ (see F2) |
| AR-2 | Switch active format | make **Portrait 9:16** active | only portrait shown | 2 shown, **both Portrait** (2760×3320, 1080×1920) | ✅ |
| AR-3 | Filter OFF | click **Choose Any** | mixed restored | 24 (20L+2P+2S) | ✅ |
| AR-4 | Orientation enforce (neg) | click a **Landscape** file into Portrait slot | rejected | toast: *"That's a landscape file — drop it in the Landscape format."* | ✅ |
| AR-5 | Orientation enforce (pos) | click a **Portrait** file into Portrait slot | assigned | slot filled, no error | ✅ (see F2) |
| AR-6 | Filter × file-search | Aspect(Portrait) + search landscape name `image_3` | intersection = 0 | 0 shown (AND logic) | ✅ |

---

## 3. Findings

### F1 — `N of 835` file counter is out of sync with filters  · Severity: Low (UX)
On the Create page the "N of 835" file counter does not track the active filters:
- With the **Aspect Ratio (16:9)** filter on, 20 files were displayed but the header still read **"24 of 835"**.
- With **Aspect Ratio (Portrait)** + a text search that matched nothing, **0** files were displayed but the header read **"2 of 2"**.

The counter reflects a partial/earlier filter state, so users can't trust it. Expected: `N` = actually-visible files after all active filters (aspect + type + text).

### F2 — Aspect-Ratio filter/label is orientation-based, not ratio-based  · Severity: Low (UX / misleading)
The toggle tooltip says *"Show files matching 16:9"*, but it actually shows **any landscape** file — displayed ratios ranged **1.33 (4:3) → 3.02 (ultra-wide)**, none excluded for differing from 1.78. Assignment behaves the same: a **2760×3320 (~5:6) portrait** image was accepted into the **"9:16"** slot. Result: a file that visually mismatches the named ratio can be assigned and will be letterboxed/distorted on the "9:16" screen. Recommend either (a) rename the control to "matching orientation", or (b) genuinely filter/warn on aspect-ratio delta. *(Consistent with earlier UX-05 note.)*

### F3 — No max-length on search input  · Severity: Informational
The list `Search…` box accepts 600+ characters (`maxLength = -1`). No crash, but no cap either. Low risk for a client-side filter; add a sane cap (e.g. 100) for consistency.

### F4 — Security: search input is safe  · Positive
Both the XSS/HTML-injection probe (`<b>QAX</b>`) and the SQL-injection string (`' OR 1=1 --`) were handled correctly — HTML-escaped in the echoed empty-state and treated as literal search terms with no error or query manipulation.

---

## 4. Summary

- **Search bar:** 10/10 pass. Correct case-insensitive substring matching, trimming, blank handling, live filtering, proper empty state, and XSS/SQLi-safe. No functional defects.
- **Aspect-Ratio filter:** 6/6 pass. Filter follows the active format's orientation, enforces orientation on assignment (rejects mismatches), and intersects correctly with the file search.
- **Defects:** 2 Low-severity UX issues (F1 counter sync, F2 misleading ratio label) + 1 informational (F3 no max-length). No blocking/functional bugs; no security issues.

*Artifacts:* `search-noresults-empty-state.png`, `aspect-ratio-filter-create-page.png`. No media set was saved (Create not submitted).
