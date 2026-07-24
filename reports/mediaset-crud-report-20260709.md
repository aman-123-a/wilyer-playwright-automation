# Media Sets — CRUD / Boundary / Search QA Report

**Target:** https://cms2.pocsample.in/library/mediaset/create (Media Sets module)
**Scope:** Noida folder (`India > uttarpradesh > Noida`, folderId `6a4f5e62472a0f8e8390871f`)
**Account:** dev@wilyer.com · **API:** `https://v3-5api2.pocsample.in/v3/cms`
**Date:** 2026-07-09 · **Tester:** Aman Kumar (Claude Code, Playwright MCP)

---

## Summary

| Area | Result |
|---|---|
| Positive create (functional) | ✅ Pass |
| Read / list / pagination | ✅ Pass |
| Update (edit) | ✅ Pass |
| Delete (confirm modal) | ✅ Pass |
| Search field smoke | ✅ Pass (incl. XSS-safe) |
| Negative validation | ⚠️ Partial — 4 gaps |
| Bulk data (150 sets) | ✅ Created, all 201 |
| **API errors found** | 🔴 **1× HTTP 500** + validation gaps |

Final Noida folder state: **152 media sets** (150 bulk + `Noida_QA_Positive_01` + `Noida_Edited_01`). Test junk cleaned up (3 records deleted).

---

## CRUD endpoints verified

| Op | Call | Result |
|---|---|---|
| Create | `POST /mediaSet/create` | 201 `{message,id}` |
| Read | `GET /mediaSet/read?page&limit&search&folderId` | 200 `{mediaSets,page,totalPages,totalDocs}` |
| Update | `POST /mediaSet/update/:id` | 200 |
| Delete | `DELETE /mediaSet/delete/:id` | 200 |

Data model: `{name, description, type:"orientation", portraitFile, landscapeFile, zones:[{ratio,w,h,label,file}], folderId}`. Each zone requires an orientation-matched file.

---

## 🔴 Bugs / API errors

### BUG-1 (High) — HTTP 500 on malformed folderId
`POST /mediaSet/create` with `folderId:"not-an-objectid"` → **500 `{"status":500}`** (no message).
Classic uncaught Mongoose `CastError`. Reproducible. Should return 400 with a validation message.
- Console: `Failed to load resource: 500 … /mediaSet/create`

### BUG-2 (Medium) — Orphan folderId accepted
`folderId` = valid ObjectId format but non-existent folder → **201 created**. No folder existence/ownership check → orphaned record not visible in any folder.

### BUG-3 (Medium) — No name length cap
Names of **300** and **5000** chars both saved (201). No client `maxlength`, no server cap.
Side effect: a 5000-char name renders the list card title **blank**.

### BUG-4 (Medium) — 0-format empty set saveable
`zones:[]` → **201**. An empty media set (0 files / 0.00 MB) can be created. Confirms the known UI bug at the API layer.

### BUG-5 (Low) — Misleading "N Screens" on card
A brand-new, never-deployed set shows e.g. "3 Screens". The count reflects the underlying **files'** screen usage, not the media set's deployment.

### Observations
- **Login is reCAPTCHA-gated (v3):** when the widget can't reach Google → "Could not connect to the reCAPTCHA service" and **Log In fires no auth POST** (silent). A page reload restored it. Worth a user-facing error + retry.
- Media-set **Search box is hidden in an empty folder** (renders only when ≥1 set) — can't confirm "no results" state inside an empty folder.

---

## ✅ Passing / correct behaviour

**Positive create:** name + description + 16:9 (landscape image) + 9:16 (portrait image) → 201, card appears in Noida.

**Negative validation (correct):**
| Input | Result |
|---|---|
| Empty name | 400 "Media set name is required" |
| Whitespace-only name | 400 (trimmed) |
| Non-existent file id | 400 "One or more files do not belong to you or do not exist." |

**Search smoke (all pass):**
| Case | Result |
|---|---|
| Exact/partial (`Bulk_099`) | 1 match, folder-scoped |
| Case-insensitive (`bulk_099`) | matched |
| No match | clean empty state, query echoed |
| HTML/XSS (`<b>xss</b>`) | **escaped** (`&lt;b&gt;…`), 0 injected nodes |

**Update:** edit page pre-populates; rename → `POST /mediaSet/update/:id` 200.
**Delete:** card Delete → custom confirm modal ("This cannot be undone", correct name) → `DELETE …` 200, count decrements.

---

## Bulk data creation
150 image-based media sets (`Noida_Bulk_001`–`150`) created via the app's `mediaSet/create` API (concurrency 6, retry-on-429). **All 201, zero 429s.** Both zones use images (landscape `image_3`, portrait `corrugation_factory`). Verified in UI — list paginates 20/page (8 pages).
