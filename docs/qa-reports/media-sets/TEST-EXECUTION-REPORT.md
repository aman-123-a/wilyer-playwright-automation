# Media Sets — Test Execution Report

| | |
|---|---|
| **Application** | Wilyer CMS — Library ▸ Media Sets |
| **Environment** | **cms2.pocsample.in** (Pre-Production 2) · build v3.5.25 · API v3-5api2.pocsample.in |
| **Executed** | 2026-10-07 · Chromium (headed and headless) · Playwright |
| **Executed by** | Aman Kumar's QA framework, run by Claude Code |
| **Test suite** | [`test-cases.csv`](test-cases.csv) (215 cases) → results in [`test-results.csv`](test-results.csv) |
| **Scope rule** | cms2 only. Test data carries the prefix `ZZ_QA_MS_` and is deleted after each test; the account was verified back to its pre-test sets. |

## 1. Executive summary

**137 of 215 cases were executed (64%).** 100 passed, 9 failed, 10 confirmed existing defects (expected-fail tests that still reproduce), 10 are observations that need a product decision, 4 are partially covered, 4 were blocked and 78 were not run.

**Verdict: not ready to sign off.** Core CRUD, search, pagination, bulk delete/move and 220-record volume work correctly and perform well. But the run found **one access-control defect that should be fixed before release**, a cluster of API validation/500 defects, and several publish-screen UI items that do not meet their ClickUp acceptance criteria.

### Top findings

| # | Severity | Finding | Case |
|---|---|---|---|
| 1 | **High — security** | A **folder-fenced maker cannot list a root-level media set, but can read, rename and delete it by id** (read 200, update 200, delete 200; the admin then sees the rename / a 404). The fence is applied to the list only. | MS-SC-04 |
| 2 | High | Operator-shaped query values (`search[$ne]`, `folderId[$ne]`, `type[$ne]`, path `{"$gt":""}`) return **HTTP 500** instead of a 4xx — unhandled input reaches the query layer. No result widening seen. | MS-SC-09 |
| 3 | High | A 100 KB name returns **500**; 500 zones are **accepted (201)** — no size or zone-count limits. | MS-SC-14 |
| 4 | Medium | Server-side validation gaps: name `null`/number accepted, no name length cap, `zones` omitted accepted, portrait file accepted in the Landscape zone, same file accepted for both zones, duplicate/mismatched zones accepted, orphan `folderId` accepted, **update can blank the name** (create refuses). | MS-API-D1..D6, MS-EDG-05/11, MS-SC-15 |
| 5 | Medium | Malformed ids/folderId on **update, delete, read** return **500** (create returns 400). | MS-API-D7, D8 |
| 6 | Medium | A wrong HTTP method returns a 404 whose body exposes the server path `/var/www/v3-2/server/v3/cms/…` and `ENOENT`. | MS-API-D9, MS-SC-18 |
| 7 | Medium | Publish screen: file name still truncated, no aspect-ratio text, row thumbnail 52×39 px and failed to load, helper is plain text with the long copy (ClickUp 86d3ra60z, 86d3ra6gb, 86d3ra6nh, 86d3ra650). | MS-FN-P09/P11/P12 |
| 8 | Low | No clickjacking/XSS-hardening headers on the app (no X-Frame-Options, CSP, X-Content-Type-Options, HSTS); `footprint` session cookie is not httpOnly/secure; API CORS returns `Access-Control-Allow-Origin: *` (no credentials flag); no rate limiting seen. | MS-SC-19/20/23 |
| 9 | Low | Bulk delete is serial: 20 sets block the confirm modal for **16.4–16.9 s** (≈0.8 s/set). | MS-PF-06/17 |
| 10 | Low | Tab badge "Media Sets (N)" is one higher than the list's "Total - N". | MS-FN-R09 |

## 2. Results by test type

| Type | Total | Pass | Fail | Defect | Observed | Partial | Blocked | Not Run |
|---|---|---|---|---|---|---|---|---|
| Smoke | 8 | 7 | 0 | 0 | 0 | 0 | 0 | 1 |
| Basic CRUD | 12 | 6 | 0 | 0 | 0 | 0 | 0 | 6 |
| API | 32 | 19 | 0 | 10 | 2 | 0 | 0 | 1 |
| Functional | 68 | 37 | 3 | 0 | 1 | 4 | 0 | 23 |
| Edge Case | 32 | 11 | 2 | 0 | 2 | 0 | 0 | 17 |
| Use Case | 13 | 3 | 0 | 0 | 0 | 0 | 1 | 9 |
| Regression | 9 | 2 | 0 | 0 | 0 | 0 | 0 | 7 |
| Performance | 17 | 12 | 0 | 0 | 0 | 0 | 0 | 5 |
| Security | 24 | 3 | 4 | 0 | 5 | 0 | 3 | 9 |
| **TOTAL** | **215** | **100** | **9** | **10** | **10** | **4** | **4** | **78** |

*Legend — **Pass**: expected result met. **Fail**: expected result not met (new defect). **Defect**: a known defect still reproduces (automated as an expected-fail test, so it turns red when fixed). **Observed**: behaviour recorded, needs a product decision. **Partial**: only part of the case could be checked. **Blocked**: could not run (reason given). **Not Run**: not executed.*

## 3. How it was executed

| Stage | What ran | Result |
|---|---|---|
| Automated suite (headless, 1 worker) | 76 Playwright tests: smoke, CRUD, bulk, load, 220-record volume, API contract/validation/defects, existing create-builder and search specs | 74 passed, 2 failed (both: spec timing, see §11), 0 skipped, 764 s. After the fix the two affected specs re-ran 13/13 green. |
| Scripted API/security batch (headed) | Edge, hardening and token-tampering cases | recorded per case |
| Role/access batch (headed) | Admin, maker and checker identities against the same disposable sets | recorded per case |
| Headed UI batch | Builder create / cancel / double-click / refresh, Clear Media, Change ratio, video format, replace file, File Details, two-tab, cookie removal, offline Save | 19 cases, recorded per case |
| Earlier manual observation | Publish picker, approval modal, View off-canvas, multi-set publish (nothing submitted; non-GET calls blocked) | carried into the results |

### Performance results (measured on cms2)

| Measure | Result | Budget | Verdict |
|---|---|---|---|
| List API p95 (3+ sets / 220+ sets) | 1406 ms / 836 ms | 3000 ms | Pass |
| Search API p95 | 849 ms (one name at 220+ sets: 415 ms) | 3000 ms | Pass |
| Wide search (prefix, limit 100) p95 @220+ | 1267 ms | 3000 ms | Pass |
| Create 220 sets @ concurrency 5 | 18.0 s (82 ms/set, 12.2 sets/s), 0 × 429 | — | Pass |
| Pagination @220 sets | 11 pages, no duplicate / gap | — | Pass |
| UI first card (/library → Media Sets) | 3211 ms | 4000 ms | Pass (close to the limit) |
| UI search over 220 sets → Total + first card | 1842 ms | 8000 ms | Pass |
| **UI bulk delete of 20 sets (modal blocked)** | **16.4–16.9 s** | none defined | **Needs a target** |
| API delete 200 sets @ concurrency 5 | 15.7 s (79 ms/set) | — | Pass |
| 10 parallel list calls | 2.0 s wall-clock, all 200 | — | Pass |

## 4. Defects raised from this run

| Ref | Severity | Defect | Case | Evidence |
|---|---|---|---|---|
| SC-BAC | High | Fenced maker can read/update/delete a root media set it cannot list | MS-SC-04 | Maker (isRestrictedAccess=true): list of 2 root sets → sees 0; GET read/{id} → 200; POST update → 200 and admin sees the new name; DELETE → 200 and admin read → 404. |
| SC-500 | High | Operator-shaped query values cause HTTP 500 | MS-SC-09 | /mediaSet/read?search[$ne]=x, search[$regex]=.*, folderId[$ne]=1, type[$ne]=x and read/{"$gt":""} all → 500. |
| SC-SIZE | High | No input size limits | MS-SC-14 | 100 KB name → 500; 500 zones → 201. |
| API-D1 | Medium | name null / number accepted | MS-API-D1 | Saved as "null" / "12345". |
| API-D2 | Medium | No name length cap | MS-API-D2 | 300 and 5000 characters → 201. |
| API-D3 | Medium | zones omitted accepted | MS-API-D3 | Only zones:[] is rejected. |
| API-D4 | Medium | Orientation not enforced server-side | MS-API-D4 | Portrait file in Landscape zone → 201; same landscape file in both zones → 201. |
| API-D5 | Medium | Orphan folderId accepted | MS-API-D5 | folderId 000…001 → 201. |
| API-D6 | Medium | Update can blank the name | MS-API-D6 | Update name "" → 200. |
| API-D7/D8 | Medium | Malformed id / folderId → 500 | MS-API-D7, D8 | update/delete "not-an-id" and read?folderId=zz → 500. |
| API-D9 | Medium | Path disclosure on wrong method | MS-API-D9 | 404 body: ENOENT … stat '/var/www/v3-2/server/v3/cms/mediaSet/create'. |
| API-D10 | Low | Invalid paging values accepted | MS-API-D10 | limit=-5, limit=abc, page=-1 → 200. |
| UI-PUB | Medium | Publish row UI misses ClickUp criteria | MS-FN-P09/P11/P12 | Truncated name, no aspect-ratio text, 52×39 px broken thumbnail, plain-text helper. |
| UI-BADGE | Low | Tab badge ≠ list total | MS-FN-R09 | Media Sets (6) vs Total - 5. |
| SC-HDR | Low | Missing security headers; cookie not httpOnly/secure | MS-SC-19/23 | No X-Frame-Options/CSP/XCTO/HSTS; footprint httpOnly=false, secure=false. |
| PF-BULK | Low | Serial bulk delete blocks UI | MS-PF-06/17 | ≈0.8 s per set; 20 sets ≈ 16.5 s. |

## 5. Failed cases (9)
Expected result not met.

| Case | Type | Title | Evidence |
|---|---|---|---|
| MS-FN-P09 | Functional | Row layout: full file name on line 1; resolution · aspect ratio · match on line 2 | Assignment row shows 'poster_export_file_…' truncated on one line; second line reads '1080×1919 \| Image' with no aspect ratio (expected '1080×1919 · 9:16 · Image'). Matches ClickUp 86d3ra60z and 86d3ra6gb. |
| MS-FN-P11 | Functional | Row thumbnail loads | Row thumbnail rendered 52×39 px and did not load (naturalWidth 0, alt text shown). Matches ClickUp 86d3ra6nh. |
| MS-FN-P12 | Functional | Grey helper container with the short explanatory copy | Helper is a plain ⓘ line without a grey container and uses the long sentence 'If you did not assign media by aspect ratio… automatically assigned the file… closest to it'. Matches ClickUp 86d3ra650 (copy/colour still open with PM). |
| MS-EDG-05 | Edge Case | Very long name (300 and 5000 characters) | 300 chars → 201, 5000 chars → 201 — no length limit (MS-API-D2) |
| MS-EDG-11 | Edge Case | Same file placed in both formats | same landscape file accepted for both Landscape and Portrait zones (201) — orientation not enforced server-side (MS-API-D4) |
| MS-SC-04 | Security | Folder-fenced sub-user cannot see or change sets outside its folder | maker fenced=true; maker list of the 2 root sets → 200, sees 0; read-by-id of an unlisted root set → 200; update → 200, admin now sees name "…_root_a_BY_MAKER"; delete → 200, admin read afterwards <404>; maker create at root → 201 — a folder-fenced identity cannot LIST the set but can read/update/delete it by id: the fence is applied to the list only (broken |
| MS-SC-14 | Security | Oversized payloads and name length are bounded | 100KB name → 500; 500 zones → 201 — oversize input accepted; no length/zone-count cap |
| MS-SC-15 | Security | Zone count/orientation tampering: landscape file in portrait slot, duplicate zones, ratio mismatch | two Landscape zones → 201; ratio label 1:1 with w/h 16:9 → 201 — inconsistent/duplicate zones accepted |
| MS-SC-18 | Security | HTTP method and content-type handling | GET /mediaSet/create → 404; PUT /mediaSet/update → 404; PATCH /mediaSet/update → 404; POST /mediaSet/delete → 404; GET /mediaSet/delete → 404 — 404 bodies expose the server path (MS-API-D9); no state change |

## 6. Known defects still reproducing (10)
Automated as `test.fail()` — they stay green while the bug exists and fail when it is fixed.

| Case | Type | Title | Evidence |
|---|---|---|---|
| MS-API-D1 | API | name null / number accepted on create | Defect still reproduces — expected-fail test API-D1: passed (1.7s) |
| MS-API-D2 | API | No name length cap | Defect still reproduces — expected-fail test API-D2: passed (1.7s) |
| MS-API-D3 | API | zones omitted entirely is accepted | Defect still reproduces — expected-fail test API-D3: passed (1.7s) |
| MS-API-D4 | API | Orientation not enforced server-side | Defect still reproduces — expected-fail test API-D4: passed (1.7s) |
| MS-API-D5 | API | Orphan folderId accepted | Defect still reproduces — expected-fail test API-D5: passed (1.7s) |
| MS-API-D6 | API | Update can blank the name | Defect still reproduces — expected-fail test API-D6: passed (2.0s) |
| MS-API-D7 | API | Malformed id on update/delete is a 500 | Defect still reproduces — expected-fail test API-D7: passed (3.4s) |
| MS-API-D8 | API | Malformed folderId on read is a 500 | Defect still reproduces — expected-fail test API-D8: passed (2.1s) |
| MS-API-D9 | API | Wrong HTTP method leaks the server filesystem path | Defect still reproduces — expected-fail test API-D9: passed (1.3s) |
| MS-API-D10 | API | Invalid paging values silently accepted | Defect still reproduces — expected-fail test API-D10: passed (1.4s) |

## 7. Observations needing a decision (10)

| Case | Type | Title | Evidence |
|---|---|---|---|
| MS-API-22 | API | folderId and type filters narrow the list | search total 34; type=orientation → 34; type=zzz → 34 — unknown type value is ignored (no filtering, no error) |
| MS-API-32 | API | Sub-user token is scoped to its folder | restricted: login unavailable (404 {"message":"User not found"}) \| unrestricted: login unavailable (404 {"message":"User not found"}) \| maker: fenced=true; list 200 (sees admin's set: false, 0 sets); create 201; update admin's set 200; delete(unknown id) 404 \| checker: fenced=true; list 403 (sees admin's set: false, 0 sets); create 403; update admin's set |
| MS-FN-R09 | Functional | Media Sets tab count badge | Library tab badge 'Media Sets (4)' while the panel header read 'Total - 3'. Product decision needed on which number is right. |
| MS-EDG-20 | Edge Case | Two tabs edit the same set | two editors on one set: later save wins silently — final name "…_two_A" (no conflict warning shown to the user who saved second) |
| MS-EDG-21 | Edge Case | Session expires while editing | Clearing the footprint cookie mid-edit did not stop the Save (it succeeded): the app keeps the bearer token in memory, so removing the cookie does not end the in-page session. A true server-side expiry/revocation was not simulated, so this case is not a verdict on session handling. |
| MS-SC-06 | Security | Per-action permission split: view-only role cannot create/edit/delete/publish/move | No dedicated view-only identity exists on cms2 (no CMS_VIEWER_*). The checker is a no-access role (403 on list/read/create/update/delete) and the maker is full-write; a read-only-but-not-write case could not be exercised. |
| MS-SC-09 | Security | NoSQL operator injection in search, folderId and id params | search[$ne] → 500; search[$regex] → 500; folderId[$ne] → 500; type[$ne] → 500; id operator → 500; baseline total 48 — 5xx on an operator-shaped value (should be a 4xx) |
| MS-SC-19 | Security | CORS and security headers | API with foreign Origin: ACAO=*, ACAC=none, status 200. app headers: X-Frame-Options=none, CSP=none, X-Content-Type-Options=none, HSTS=none — no clickjacking protection header |
| MS-SC-20 | Security | Rate limiting on create and delete | 48 reads in 5561ms @4 parallel → 0 × 429, others 200; creates earlier: 220 @5 parallel → 0 × 429 — no rate limiting observed at this volume |
| MS-SC-23 | Security | Session cookie flags and logout invalidation | footprint cookie: httpOnly=false, secure=false, sameSite=Lax — readable by page JavaScript (known posture, XSS would expose the token) |

## 8. Partially covered (4)

| Case | Type | Title | Evidence |
|---|---|---|---|
| MS-FN-B11 | Functional | Bulk Publish Media Set (N) with several sets | Ticking 2 sets and pressing 'Publish Media Set (2)' reached the same picker and modal; exactly one View button, no media-set names visible outside the off-canvas. Publish not submitted. |
| MS-FN-P06 | Functional | Auto-assignment picks the closest aspect-ratio file when the user assigns nothing | Single 9:16 screen got the portrait file automatically with a green 'Perfect Match — Optimal display quality' badge. Multi-ratio best-fit not exercised (only one offline screen with one ratio was selected). |
| MS-FN-P08 | Functional | Multi-set publish: one file per media set, in listed order | Two selected sets show 'Media set 1 of 2' with a set dropdown and prev/next arrows (not tabs) and the text 'Each of the 2 selected media sets contributes one file per screen… play one after another in the order listed'. Actual playback order not verified (needs a live screen). Set _b was listed first although _a was ticked first. |
| MS-FN-P10 | Functional | Hover/click on file name reveals full name; click thumbnail previews | Full file name is present as a native title attribute (hover tooltip); clicking the thumbnail opens a lightbox showing name, type, dimensions, aspect ratio '1080:1919' (unreduced) and created date. Video play and dropdown-option hover not verified. |

## 9. Blocked (4)
Could not be run on cms2; reason given.

| Case | Type | Title | Evidence |
|---|---|---|---|
| MS-UC-10 | Use Case | Folder-restricted sub-user manages only their folder's sets | restricted login unavailable: 404 {"message":"User not found"} |
| MS-SC-03 | Security | IDOR: update/delete another account's media set id | IDOR across tenants needs a second independent account; every identity in .env belongs to the same account (CMS_OLD_* is another server). Same-account role matrix recorded under MS-SC-04/05. |
| MS-SC-12 | Security | File ids in zones must belong to the caller | needs a second tenant account to supply a foreign file id; none configured on cms2 |
| MS-SC-16 | Security | Media set response does not leak screen secrets | no published set to inspect |

## 10. Not run (78)

Not executed in this pass. Most need live screens, a second tenant, or a build/feature not present on cms2. IDs by type:

- **Smoke** (1): MS-SMK-08
- **Basic CRUD** (6): MS-CRUD-03, MS-CRUD-04, MS-CRUD-05, MS-CRUD-06, MS-CRUD-07, MS-CRUD-12
- **API** (1): MS-API-33
- **Functional** (23): MS-FN-C02, MS-FN-C07, MS-FN-R02, MS-FN-R03, MS-FN-R04, MS-FN-R05, MS-FN-R07, MS-FN-U01, MS-FN-U04, MS-FN-U05, MS-FN-D04, MS-FN-D05, MS-FN-B09, MS-FN-B12, MS-FN-P07, MS-FN-P13, MS-FN-P14, MS-FN-P15, MS-FN-I01, MS-FN-I02, MS-FN-I03, MS-FN-U-X01, MS-FN-U-X02
- **Edge Case** (17): MS-EDG-07, MS-EDG-08, MS-EDG-09, MS-EDG-10, MS-EDG-13, MS-EDG-14, MS-EDG-17, MS-EDG-18, MS-EDG-23, MS-EDG-25, MS-EDG-26, MS-EDG-27, MS-EDG-28, MS-EDG-29, MS-EDG-30, MS-EDG-31, MS-EDG-32
- **Use Case** (9): MS-UC-01, MS-UC-02, MS-UC-03, MS-UC-04, MS-UC-05, MS-UC-08, MS-UC-09, MS-UC-11, MS-UC-12
- **Regression** (7): MS-RG-01, MS-RG-04, MS-RG-05, MS-RG-06, MS-RG-07, MS-RG-08, MS-RG-09
- **Performance** (5): MS-PF-07, MS-PF-08, MS-PF-10, MS-PF-11, MS-PF-12
- **Security** (9): MS-SC-01, MS-SC-07, MS-SC-08, MS-SC-10, MS-SC-11, MS-SC-13, MS-SC-21, MS-SC-22, MS-SC-24

## 11. Limitations and risks of this run

- **No live screen was published to.** Publish, unpublish, approval and escalation e-mail cases are Not Run/Partial; playback order and per-ratio auto-assignment were only checked up to the approval modal (nothing submitted — all non-GET calls were blocked during those passes).
- **Two identities in `.env` no longer exist on cms2** (`restricted` and `unrestricted` log in with "User not found"), so the folder-fence and account-wide sub-user cases were run with the **maker** identity, which is also folder-fenced. A second independent tenant is not configured, so cross-account IDOR (MS-SC-03, MS-API-33) is Blocked.
- **cms2 is shared.** Another user's set (“SQ”) appeared during the run and was never touched. Volume and burst tests were bounded (concurrency ≤ 5) and fully cleaned up.
- **Security cases are black-box checks only** — no exploit payloads beyond validation probes, no brute force, no DoS.
- Two failures in the pre-existing create-builder spec (type-filter totals; F1 counter-vs-tiles) were investigated and are **not product defects**: the file counter and tiles lag a filter click by 1–2 s, and the spec read them after 1 s. Once settled the counters are consistent (All 886, Images 479, Videos 402). The spec wait was lengthened to 2.5 s and the builder + search specs now pass 13/13. (An early note in this run that the Videos counter showed the All total came from the same stale read and is withdrawn.)

## 12. Evidence and re-run

- Per-case verdicts and evidence: [`test-results.csv`](test-results.csv)
- Raw Playwright results: `reports/cms2/exec/automated.json`; scripted verdicts: `reports/cms2/exec/extended.jsonl`
- Specs: `tests/cms2/media-sets/{smoke,crud,functional,api,load}/` and `tests/cms2/media-sets/_exec/`
- Re-run everything against cms2: `npx cross-env TEST_ENV=cms2 playwright test tests/cms2/media-sets --project=chromium --project=api --headed`
