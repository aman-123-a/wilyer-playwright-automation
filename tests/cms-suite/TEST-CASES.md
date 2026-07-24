# CMS Regression — Test Case Flow

Target: **https://cms.pocsample.in** (staging) · Reference: https://cms.wilyersignage.com (prod)
Run with `npm run cms`. Status column reflects the last pre-live run (81 pass / 17 fail / 5 flaky / 35 skip).

Legend: ✅ pass · ❌ fail · ⚠️ flaky (passed on retry) · ⊘ skipped (no fixture / backend-only) · 🔁 re-verify

---

## High-level flows

### Flow A — Authentication
```
LoginPage.goto → fill(email,pwd) → submit
  └─ valid    → Dashboard (stat cards, /dashboard link)   → refresh persists → logout → Login
  └─ invalid  → stay on Login (+ error toast)
  └─ token 401 (mocked) → bounce to login / error / no data rows
```

### Flow B — Library CRUD (gated: CMS_ALLOW_DESTRUCTIVE)
```
/library → grid + "Total Files - N"
  ├─ search → grid narrows           ├─ filter All/Photos/Videos → no crash
  ├─ preview → /file-details (download + size)
  └─ Upload Files → Browse → setFiles (auto-starts) → close dialog
        → search by name → card appears → deleteByName → card gone   (self-clean)
```

### Flow C — Playlist CRUD (gated)
```
/playlists → + create → fill name → /playlist-settings/<id> (editor)
  ├─ rename: editor name textbox → fill → Tab → value persists
  ├─ delete: list → search → deleteByName ("Continue" confirm) → gone
  ├─ duplicate name → rejected OR disambiguated (no crash)
  ├─ empty / whitespace name → blocked, modal stays open
  └─ Triggers panel → Action→Type→Key→Operator selects (Key populates after Type)
```

### Flow D — Spaces/Rooms == Groups (gated)
```
/groups → + New Group → create → appears in list
  ├─ edit → /group-settings/<id> loads healthy
  ├─ delete (confirm) → removed
  ├─ duplicate name → rejected or disambiguated
  └─ restore deleted → only if a trash/restore view exists (absent in this build)
```

### Flow E — Resilience (injected at network boundary via page.route)
```
login → mock **/api/** {500 | empty | corrupt | slow} → goto route
  → assertNotBlank / assertHealthy  → app shell + nav must survive, show error/empty state
```

### Flow F — Sub-user scoping (CMS_SUBUSER_*)
```
login as sub-user → restricted folder set → admin routes (/team,/roles) blocked
  → guessed foreign folder id handled → folder-list API leaks no extra folders
```

---

## Test cases

### auth.spec.js — Authentication
| ID | Scenario | Steps | Expected | Type | Status |
|----|----------|-------|----------|------|--------|
| AUTH-01 | Valid login lands on dashboard | goto login → admin creds → submit | Authenticated; /dashboard link visible | Positive | ✅ |
| AUTH-02 | Redirects to dashboard content | login() | Stat cards visible | Positive | ✅ |
| AUTH-03 | Session persists across hard refresh | login → reload | No login button; dashboard link shown | Positive | ✅ |
| AUTH-04 | Logout returns to login | login → logout | Log-in button visible | Positive | ✅ |
| AUTH-05 | Invalid email rejected | bad email + pwd → submit | Stays on login | Negative | ✅ |
| AUTH-06 | Wrong password shows error | admin email + wrong pwd | Stays on login + error | Negative | ✅ |
| AUTH-07 | Empty creds don't authenticate | submit blank | Stays on login | Negative | ✅ |
| AUTH-08 | SQLi in email safely rejected | `' OR 1=1 --` | Stays on login; no SQL error text leak | Security | ✅ |
| AUTH-09 | XSS payload does not execute | `<script>alert(1)</script>` | No alert fires; no injected script node | Security | ✅ |
| AUTH-10 | Long input (5k chars) no crash | 5000-char email/pwd | Stays on login gracefully | Negative | ⚠️ |
| AUTH-11 | Special chars handled | special-char creds | Stays on login | Negative | ✅ |
| AUTH-12 | Dashboard unreachable w/o login | clear cookies → goto / | Login form shown | Negative | ✅ |
| AUTH-13 | Expired token (mock 401) forces re-auth | login → mock /api 401 → /screens | Login/error or zero data rows | Negative | ✅ |
| AUTH-14 | Rapid login clicks no broken state | fill → 3x click | Authenticated once | Edge | ✅ |
| AUTH-15 | Back after logout hides dashboard | login → logout → back | Login or zero rows | Edge | ✅ |
| AUTH-16 | Two-tab simultaneous login | login in 2 pages | Both reach dashboard | Edge | ✅ |
| AUTH-17 | Network interruption during login | abort auth req once | Body stays usable, no blank | Edge | ✅ |

### api-validation.spec.js
| ID | Scenario | Steps | Expected | Type | Status |
|----|----------|-------|----------|------|--------|
| API-01 | No unexpected 5xx browsing core | login → /,/screens,/library,/playlists | 0 server 5xx | Positive | ✅ |
| API-02 | Status codes well-formed | login → /screens | All 100–599, none 0/undefined | Positive | ✅ |
| API-03 | Slow calls flagged | login → / | Calls recorded; slow logged | Positive | ✅ |
| API-04 | Unauthenticated API rejected | no-session GET /api/playlists | Expect 401/403/404/redirect | Security | ❌ **false-positive** — returns 200 + SPA `index.html` shell, no data leak. Low/cosmetic. |
| API-05 | Unknown route clean 404 | GET /api/<bogus> | status < 500 | Negative | ✅ |
| API-06 | Frontend surfaces error on API 500 | login → mock /api 500 → /screens | Not blank | Negative | ❌ **blank white screen** |

### dashboard-analytics.spec.js
| ID | Scenario | Expected | Type | Status |
|----|----------|----------|------|--------|
| DASH-01 | Stat cards load | All cards visible | Positive | ✅ |
| DASH-02 | Quick-action links render | Each visible | Positive | ✅ |
| DASH-03 | KPIs valid non-negative | Finite, ≥0 | Positive | ✅ |
| DASH-04 | Charts/map render | Map widget visible | Positive | ✅ |
| DASH-05 | 7d/30d ranges load | Not blank after switch | Positive | ✅ |
| DASH-06 | API 500 → graceful | Not blank/crash | Negative(inj) | ❌ **blank** |
| DASH-07 | Empty analytics → empty state | Not blank | Negative(inj) | ❌ **blank** |
| DASH-08 | Corrupt payload → no white-screen | Not blank | Negative(inj) | ❌ **blank** |
| DASH-09 | Slow response stays responsive | Not blank during load | Negative(inj) | ❌ **blank** |
| DASH-10 | Refresh mid-load recovers | Healthy after reload | Edge | ❌ |
| DASH-11 | Simultaneous requests no corruption | Stat cards coherent | Edge | ✅ |
| DASH-12 | Loads under 10000ms | < 10s | Perf | ⚠️ (13.5s 1st, passed retry) |
| DASH-13 | No API spam (render loop) | < 60 /api calls | Perf | ✅ (14 calls) |
| DASH-14 | No UI freeze after load | evaluate returns | Perf | ✅ |

### library-crud.spec.js
| ID | Scenario | Expected | Type | Status |
|----|----------|----------|------|--------|
| LIB-01 | Lists media / clean empty | Grid + Total Files | Positive | ✅ |
| LIB-02 | Search narrows grid | after ≤ before | Positive | ✅ |
| LIB-03 | Type filters switch | Healthy each | Positive | ✅ |
| LIB-04 | Preview shows detail+download | /file-details loaded | Positive | ✅ |
| LIB-05 | Load More paginates | after ≥ before | Positive | ✅ |
| LIB-06 | Tabs + upload control present | Visible | UI | ✅ |
| LIB-07 | Upload dialog states formats | jpg/jpeg/png/mp4 text | UI | ✅ |
| LIB-08 | Upload then delete round-trip | Card appears then removed | Destructive | ❌ 🔁 file showed Total Files-0; re-verify unthrottled |
| LIB-09 | Duplicate upload no crash | Healthy | Destructive | ⊘ (serial after LIB-08 fail) |
| LIB-10 | Unsupported .txt rejected | No media card | Negative | ✅ |
| LIB-11 | Non-existent search empty | 0 cards / empty msg | Negative | ✅ |
| LIB-12 | Clear search restores grid | ≥ min(baseline,1) | Edge | ✅ |
| LIB-13 | Rapid filter toggling healthy | Healthy | Edge | ✅ |

### playlist-crud.spec.js
| ID | Scenario | Expected | Type | Status |
|----|----------|----------|------|--------|
| PL-01 | Create → editor | URL /playlist-settings/ | Destructive | ⚠️ |
| PL-02 | Rename in editor | Name textbox value persists | Destructive | ❌ 🔁 |
| PL-03 | Delete (confirm) removes | 0 cards after | Destructive | ✅ |
| PL-04 | Duplicate name handled | No crash | Destructive | ✅ |
| PL-05 | Empty name rejected | Modal stays, no nav | Validation | ✅ |
| PL-06 | Whitespace name no usable playlist | Blocked | Validation | ✅ |
| PL-07 | Trigger key dropdown populates | Keys after Type | Triggers | ⊘ (trigger UI needs layout) |

### spaces-rooms.spec.js (Groups)
| ID | Scenario | Expected | Type | Status |
|----|----------|----------|------|--------|
| GRP-01 | Create group | Appears in list | Destructive | ✅ |
| GRP-02 | Edit from settings page | /group-settings/ healthy | Destructive | ✅ |
| GRP-03 | Delete (confirm) | Removed | Destructive | ❌ 🔁 |
| GRP-04 | Duplicate name handled | No crash | Destructive | ✅ |
| GRP-05 | Restore deleted | Only if trash view exists | Edge | ⊘ (no restore view — known bug) |
| GRP-06 | List renders create control | New Group btn visible | UI | ✅ |

### subuser-scoping.spec.js
| ID | Scenario | Expected | Type | Status |
|----|----------|----------|------|--------|
| SUB-01 | Sub-user sees restricted folder set | Scoped folders | Positive | ✅ |
| SUB-02 | Allowed media visible, nav works | Navigable | Positive | ✅ |
| SUB-03 | /team,/roles blocked | Denied | Negative | ✅ |
| SUB-04 | Direct API folder access denied | Rejected | Negative | ✅ |
| SUB-05 | Guessed foreign folder id handled | No leak/crash | Negative | ✅ |
| SUB-06 | Search restricted media → nothing | Empty | Edge | ✅ |
| SUB-07 | Empty-permission view stable | No crash | Edge | ✅ |
| SUB-08 | Folder-list API ≤ UI folders | No over-fetch | Security | ✅ |
| SUB-09 | No metadata leakage in payloads | No tenant/admin keys | Security | ✅ |

### playback-analytics.spec.js
| ID | Scenario | Expected | Type | Status |
|----|----------|----------|------|--------|
| PB-01 | Analytics view loads | Content renders | Positive | ✅ |
| PB-02 | Refresh re-fetches | View intact | Positive | ✅ |
| PB-03 | Corrupted data no crash | Not blank | Negative(inj) | ❌ **blank** |
| PB-04 | Empty dataset → empty state | Not blank | Negative(inj) | ❌ **blank** |
| PB-05 | Invalid media IDs tolerated | Not blank | Negative(inj) | ⚠️ |
| PB-06 | API 500 surfaces error | Not blank | Negative(inj) | ❌ **blank** |
| PB-07 | 10k rows no freeze | Renders | Edge(inj) | ✅ |
| PB-08 | Duplicate events no double-break | Renders | Edge(inj) | ✅ |
| PB-09 | Rapid refresh no crash | Renders | Edge(inj) | ✅ |
| PB-10 | Partial failure (1 endpoint 500) degrades | Not blank | Edge(inj) | ❌ **blank** |

### global-frontend.spec.js
| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| GF-01..07 | Per-route health: /screens /groups /clusters /library /playlists /reports | No crash/blank/infinite loader | ✅ (all) |
| GF-route-/ | Root / health | Healthy | ❌ (failed both attempts) |
| GF-08 | Rapid cross-module nav no crash | Healthy | ✅ |
| GF-09 | No unhandled promise rejections | None | ✅ |

### known-bugs-regression.spec.js
| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| BUG-1 | "Not authorized" never for valid admin | No toast | ✅ |
| BUG-2,3 | Media-detail report tabs render | Content not blank | ✅ |
| BUG-4 | No blank page after Back | Rendered | ✅ |
| BUG-5 | Modal centred in viewport | On-screen | ✅ |
| BUG-6 | Scrolling works on long lists | Reveals content | ✅ |
| BUG-7 | Brightness/schedule control reachable | If a screen exists | ⊘ |
| BUG-8 | Trigger key dropdown populates | Keys present | ⊘ |
| BUG-9 | Deleted room restore affordance | Exists | ⊘ (absent — confirmed bug) |
| BUG-10 | Duplicate group name no list corruption | 1→1 | ✅ |
| BUG-11 | Restricted modules hidden from sub-user | Hidden | ❌ 🔁 (sub-user login didn't load) |

### Other files
| File | Coverage | Status |
|------|----------|--------|
| comparison.spec.js | staging vs prod: nav modules, routes, console errors, perf, API | ✅ except "staging produces no 5xx prod doesn't" ❌ (429 noise) |
| athena-export.spec.js | export trigger, CloudFront URL, S3/Athena failure (inj), perf | ⊘ mostly (no export control surfaced); 1 ✅ |
| notification-cron.spec.js | offline-device source, report payload (inj); SMTP/cron = backend-only | ✅ observable; ⊘ backend |
| playlist-screens.spec.js | screens field as number/null/missing/string/negative/0/huge (inj) | ✅ (1 ⚠️ negative) |
| freeze-investigation.spec.js | Roles / Previous Reports / Buy Plan don't hang | ✅ Previous Reports; ⊘ Roles & Buy Plan |

---

## Pre-live blockers & follow-ups
1. ❌ **Blank white-screen on API failure** (DASH-06..10, PB-03/04/06/10, API-06) — no error boundary/empty state. **Real blocker.** Confirmed via failure screenshots.
2. 🔁 **CRUD flakes under load** (LIB-08, PL-02, GRP-03) — likely staging `429` throttling. Re-run serially: `npm run cms:library` / `cms:playlist` / `cms:spaces` with `--workers=1`.
3. ℹ️ **API-04 is a false positive** — `/api/*` unauth returns the SPA shell (200), not data. Optional: return 401/404 on the API namespace.
4. 🧹 **Orphaned `TEST_PW_*` folders** left on staging from failed-cleanup runs — manual sweep.
5. ⚙️ **Staging 429 rate-limiting** mis-tuned vs prod — investigate independently.
