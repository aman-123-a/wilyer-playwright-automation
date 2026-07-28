# Campaigns V1 with RBAC — Playwright Automation Plan & Test Data

**Document ID:** CMP-QA-DOC-08

This plan **extends the existing `cms-e2e` framework** rather than introducing a parallel one.
Conventions are taken from the current repository: typed `ENV` config, page objects extending
`BasePage`, a central fixture file, console/API monitors, and the section-based RBAC harness in
`tests/permissions/rbac-data-driven.spec.ts`.

---

## 18. Automation Coverage & Tagging

### 18.1 Tag taxonomy

| Tag | Meaning | Runs on |
|-----|---------|---------|
| `@smoke` | Feature is alive — 12 cases, < 5 min | Every deploy |
| `@sanity` | Core flows work — 35 cases, < 15 min | Every PR |
| `@regression` | Full functional pack — 150 cases | Nightly |
| `@critical` | Cannot ship if failing | Gate on release |
| `@p1` / `@p2` | Priority bands | Selective runs |
| `@api` | API-layer only (no browser) | Fast pipeline |
| `@ui` | Browser-driven | Standard pipeline |
| `@rbac` | Permission matrix | Nightly + on any role-code change |
| `@playback` | Requires a player or the resolved-schedule payload | Scheduled / manual |
| `@destructive` | Mutates shared data — gated by `CMS_ALLOW_DESTRUCTIVE` | Test envs only, never `live` |
| `@manual` | Not automatable now (email rendering, device timing) | Excluded from CI |

### 18.2 Automation candidacy

| Category | Cases | Automatable | Notes |
|----------|-------|-------------|-------|
| CRUD | 34 | 34 (100 %) | Fully automatable |
| Folder | 28 | 27 (96 %) | RTL rendering is visual |
| Playlist | 26 | 26 (100 %) | |
| Cluster | 16 | 11 (69 %) | Offline/reconnect needs device control |
| RBAC | 36 | 36 (100 %) | Existing harness pattern |
| Playback | 26 | 14 (54 %) | Automatable at the **resolved-schedule payload** layer; on-device timing is manual |
| Approval/Publish | 20 | 18 (90 %) | |
| Email | 16 | 12 (75 %) | Needs DEP-08; rendering is manual |
| Search/Audit/DB | 18 | 14 (78 %) | DB cases need DEP-11 |
| Edge (112) | 112 | 74 (66 %) | Power failure, clock skew, device restart are manual |
| API (54) | 54 | 54 (100 %) | |
| Security (60) | 60 | 46 (77 %) | Some need a proxy/manual probing |
| Performance (42) | 42 | 30 (71 %) | Load tests need k6/Artillery, not Playwright |
| **Total** | **462** | **396 (86 %)** | |

### 18.3 Smoke pack (12 cases, gate on every deploy)

`CMP-001, 021, 026, 063, 064, 068, 086, 105, 107, 108, 143, 189`

### 18.4 Critical pack (cannot ship if red)

All P0/S1: `CMP-001, 003, 018, 024, 026, 027, 030, 035, 037, 039, 044, 047…055, 060, 063…065, 068,
070, 071, 073, 077, 084…086, 089…095, 098, 101, 104, 105…138, 141…145, 148…150, 153…155, 159, 160,
163, 164, 167, 169…171, 173, 177, 181, 182, 184, 186…191, 193, 202, 208, 220`

---

## 19. Playwright Automation Structure

### 19.1 Folder structure (new files marked ✚)

```
cms-e2e/
├── config/
│   └── env.ts                             (extend: CAMPAIGN_* toggles)
├── data/
│   ├── test-data.ts
│   └── campaigns.data.ts                 ✚ names, payloads, playback matrices
├── fixtures/
│   ├── test-fixtures.ts                   (extend: campaign page objects)
│   └── campaign-fixtures.ts              ✚ seeded campaign + cleanup fixture
├── pages/
│   ├── BasePage.ts
│   ├── PlaylistEditorPage.ts              (extend: Campaigns picker tab)
│   ├── CampaignsPage.ts                  ✚ list, search, filter, folder nav
│   ├── CampaignEditorPage.ts             ✚ create, items, reorder, durations
│   ├── CampaignPickerPage.ts             ✚ picker tab component object
│   ├── ApprovalQueuePage.ts              ✚ pending list, approve, reject
│   └── ClustersPage.ts                   ✚ assign/remove campaign, sync status
├── utils/
│   ├── apiMonitor.ts
│   ├── consoleMonitor.ts
│   ├── campaignApi.ts                    ✚ typed API helper (CRUD, publish, approve)
│   ├── permissionHelper.ts               ✚ extracted from rbac-data-driven.spec.ts
│   ├── playbackAssertions.ts             ✚ loop/LCM sequence assertions
│   ├── mailClient.ts                     ✚ test-inbox client (DEP-08)
│   └── lcm.ts                            ✚ lcm/gcd for cycle-length expectations
└── tests/
    └── campaigns/                        ✚
        ├── campaign-crud.spec.ts              CMP-001…034
        ├── campaign-folders.spec.ts           CMP-035…062
        ├── campaign-playlist.spec.ts          CMP-063…088
        ├── campaign-cluster.spec.ts           CMP-089…104
        ├── campaign-rbac.spec.ts              CMP-105…140  (data-driven)
        ├── campaign-playback.spec.ts          CMP-141…166  (payload-level)
        ├── campaign-approval.spec.ts          CMP-167…186
        ├── campaign-email.spec.ts             CMP-187…202
        ├── campaign-search-audit.spec.ts      CMP-203…220
        ├── campaign-api.spec.ts               API-001…064   @api
        ├── campaign-security.spec.ts          SEC-001…060   @api
        └── campaign-edge.spec.ts              CMP-EDGE-*    @regression
```

### 19.2 Page Object contracts

```ts
// pages/CampaignsPage.ts
export class CampaignsPage extends BasePage {
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly folderFilter: Locator;

  async goto(): Promise<void>;
  async openFolder(path: string): Promise<void>;
  async search(query: string): Promise<void>;
  async rowByName(name: string): Locator;
  async count(): Promise<number>;
  async delete(name: string, confirm?: boolean): Promise<void>;
  async move(name: string, targetFolder: string): Promise<void>;
  async isActionAvailable(name: string, action: CampaignAction): Promise<'enabled' | 'disabled' | 'absent'>;
}

// pages/CampaignEditorPage.ts
export class CampaignEditorPage extends BasePage {
  async create(name: string, items: MediaRef[]): Promise<void>;
  async addItem(item: MediaRef): Promise<void>;
  async removeItem(index: number): Promise<void>;
  async reorder(from: number, to: number): Promise<void>;
  async setItemDuration(index: number, seconds: number): Promise<void>;
  async itemNames(): Promise<string[]>;   // asserts persisted order
  async save(): Promise<Response>;        // returns the save API response
}

// pages/CampaignPickerPage.ts — component object inside the playlist editor
export class CampaignPickerPage {
  async openTab(): Promise<void>;               // clicks the "Campaigns" tab
  async isTabVisible(): Promise<boolean>;       // RBAC assertion
  async listNames(): Promise<string[]>;
  async select(name: string): Promise<void>;
  async insertAt(name: string, position: number): Promise<void>;
}

// pages/ApprovalQueuePage.ts
export class ApprovalQueuePage extends BasePage {
  async pendingItems(): Promise<PendingChange[]>;
  async approve(campaignName: string): Promise<Response>;
  async reject(campaignName: string, reason: string): Promise<Response>;
  async mediaDeltaFor(campaignName: string): Promise<{ added: number; removed: number }>;
}
```

### 19.3 Fixtures

```ts
// fixtures/campaign-fixtures.ts
export const test = base.extend<CampaignFixtures>({
  campaignsPage:      async ({ page }, use) => use(new CampaignsPage(page)),
  campaignEditorPage: async ({ page }, use) => use(new CampaignEditorPage(page)),
  campaignPicker:     async ({ page }, use) => use(new CampaignPickerPage(page)),
  approvalQueuePage:  async ({ page }, use) => use(new ApprovalQueuePage(page)),
  clustersPage:       async ({ page }, use) => use(new ClustersPage(page)),

  /** API-seeded campaign, auto-deleted after the test. Keeps UI tests fast and isolated. */
  seededCampaign: async ({ request }, use) => {
    const api = new CampaignApi(request);
    const campaign = await api.create({ name: uniqueName('QA_Camp'), items: 3 });
    await use(campaign);
    await api.delete(campaign.id).catch(() => {});   // idempotent cleanup
  },

  /** Sub-user page with a specific campaign permission set applied, then restored. */
  scopedUser: async ({ browser }, use) => {
    const helper = new PermissionHelper();
    await use(async (perms: CampaignPermissions) => {
      await helper.applyToRole(ROLE_NAME, perms);     // waits for PUT /role/update 2xx
      return helper.freshLogin(browser, ENV.SUBUSER); // full session eviction first
    });
    await helper.restore();                            // always restore the original role
  },
});
```

Two rules carried over from the existing RBAC suite, both non-negotiable:

1. **Wait for the role-save response** (`PUT /role/update` → 2xx) before logging out, otherwise
   the test races the backend.
2. **Fully evict the session** (cookies + localStorage + sessionStorage) before the sub-user
   login, otherwise a stale admin token masks the permission failure.

### 19.4 Playback assertions (the highest-value utility)

Playback is automatable **without a physical player** by asserting the resolved schedule payload
the CMS sends to the device. This converts 14 of 26 playback cases from manual to automated.

```ts
// utils/playbackAssertions.ts
export function lcm(...ns: number[]): number;

/** Expected item for a campaign slot on a given 1-based loop number (PB-RULE-01/02). */
export function expectedItem<T>(items: T[], loop: number): T {
  return items[(loop - 1) % items.length];
}

/** Build the full expected sequence for one complete cycle across N campaigns. */
export function expectedCycle(campaigns: string[][]): string[][] {
  const cycle = lcm(...campaigns.map(c => c.length));
  return Array.from({ length: cycle }, (_, i) =>
    campaigns.map(c => expectedItem(c, i + 1)));
}

/** Assert a captured playback log matches the spec exactly — no skips, no repeats. */
export async function assertLoopSequence(
  actual: string[][], campaigns: string[][],
): Promise<void>;
```

Example — spec §2 (`playback_logic.txt`) becomes a single assertion:

```ts
test('CMP-149/150 · parallel campaigns advance independently @playback @critical', async () => {
  const CampA = ['A1', 'A2'];
  const CampB = ['B1', 'B2', 'B3'];

  expect(expectedCycle([CampA, CampB])).toEqual([
    ['A1', 'B1'], ['A2', 'B2'], ['A1', 'B3'],   // CampA wraps at loop 3
    ['A2', 'B1'], ['A1', 'B2'], ['A2', 'B3'],   // CampB wraps at loop 4
  ]);

  const actual = await capturePlaybackSequence(screenId, /* loops */ 7);
  await assertLoopSequence(actual.slice(0, 6), [CampA, CampB]);
  expect(actual[6], 'loop 7 must equal loop 1 — cycle = LCM(2,3) = 6').toEqual(actual[0]);
});
```

### 19.5 RBAC data-driven extension

The campaign matrix slots directly into the existing `PERMISSIONS_TO_TEST` shape:

```ts
const CAMPAIGN_PERMISSIONS: PermissionCase[] = [
  { name: 'Campaigns · View',    kind: 'section', sectionId: 'campaigns',
    navLabel: /campaigns/i, expectedPageUrl: '/campaigns',
    apiProbe: /\/campaign\/read/ },
  { name: 'Campaigns · Create',  kind: 'checkbox', sectionId: 'campaigns', permission: 'create',
    action: p => p.getByRole('button', { name: /create campaign/i }),
    apiProbe: /\/campaign\/create/ },
  { name: 'Campaigns · Edit',    kind: 'checkbox', sectionId: 'campaigns', permission: 'edit',
    apiProbe: /\/campaign\/update/ },
  { name: 'Campaigns · Delete',  kind: 'checkbox', sectionId: 'campaigns', permission: 'delete',
    apiProbe: /\/campaign\/delete/ },
  { name: 'Campaigns · Publish', kind: 'checkbox', sectionId: 'campaigns', permission: 'publish',
    apiProbe: /\/campaign\/publish/ },
  { name: 'Campaigns · Approve', kind: 'checkbox', sectionId: 'campaigns', permission: 'approve',
    apiProbe: /\/campaign\/approve/ },
  { name: 'Campaigns · Reject',  kind: 'checkbox', sectionId: 'campaigns', permission: 'reject',
    apiProbe: /\/campaign\/reject/ },
  { name: 'Campaigns · Folder',  kind: 'checkbox', sectionId: 'campaigns', permission: 'folder',
    apiProbe: /\/campaign\/folder/ },
];
```

`kind: 'checkbox'` is a **new** variant to add to the harness — the existing one supports
`'section'` (NONE/ALL bulk) and `'switch'` (enable toggle) only, and per-permission granularity
is required for the 8-permission campaign set.

### 19.6 API helper

```ts
// utils/campaignApi.ts
export class CampaignApi {
  constructor(private request: APIRequestContext, private token?: string) {}
  create(p: CreateCampaign): Promise<Campaign>;
  read(id: string): Promise<APIResponse>;
  list(q?: ListQuery): Promise<APIResponse>;
  update(id: string, p: Partial<Campaign>): Promise<APIResponse>;
  delete(id: string): Promise<APIResponse>;
  publish(id: string, targets: Target[]): Promise<APIResponse>;
  approve(pendingId: string): Promise<APIResponse>;
  reject(pendingId: string, reason: string): Promise<APIResponse>;
  /** Fetch the resolved schedule a screen would receive — the playback oracle. */
  resolvedSchedule(screenId: string): Promise<ResolvedSchedule>;
  /** Same call with an arbitrary token — the RBAC/IDOR probe. */
  asUser(token: string): CampaignApi;
}
```

### 19.7 Execution strategy

| Concern | Decision |
|---------|----------|
| Isolation | Every test seeds its own campaign via API and deletes it in teardown; no shared fixtures across specs |
| Naming | `QA_Camp_<spec>_<timestamp>` so parallel workers never collide on BR-11 uniqueness |
| RBAC serialisation | `test.describe.configure({ mode: 'serial' })` — role state is shared and mutable |
| Everything else | Fully parallel |
| Destructive gating | `test.skip(!ENV.ALLOW_DESTRUCTIVE)` on delete/publish specs; hard-blocked on the `live` branch |
| Flake control | Wait on API responses, never `waitForTimeout`; the existing suite's `waitForTimeout(1_200)` calls are a known smell to avoid in new code |
| Retries | 1 in CI, 0 locally |
| Artifacts | Console + API monitor summaries attached on failure (already wired in `test-fixtures.ts`) |

---

## 20. Test Data

### 20.1 Valid names

```
QA_Camp_Basic            QA_Camp_Single           QA_Camp_Mixed
Campaign 2026 Q3         Morning-Rotation         promo_v2
A                        <255-char string>        Camp.With.Dots
```

### 20.2 Invalid / hostile names

```
""                       "     "                  null
<256-char string>        "QA_Camp_Basic"          (duplicate)
"qa_camp_basic"          (case duplicate)         "  QA_Camp_Basic  "  (trim duplicate)
<script>alert(1)</script>
'; DROP TABLE campaign;--
{{7*7}}                  ../../etc/passwd         "camp name"
"camp\nname"             "‮reversed"         (bidi override)
```

### 20.3 Unicode / emoji / RTL

```
अभियान_परीक्षण            广告活动测试              キャンペーン
حملة إعلانية              מסע פרסום               Кампания
Camp 🎉🔥🚀              🎉🎉🎉                    Café_Ñoño
```

### 20.4 Media combinations for playback matrices

| Fixture | Composition | Cycle length | Used by |
|---------|-------------|--------------|---------|
| `CAMP_1` | `[Img1]` | 1 | CMP-146, EDGE-001 |
| `CAMP_2` | `[Img1, Img2]` | 2 | CMP-147, EDGE-002 |
| `CAMP_3` | `[Img1, Img2, Img3]` | 3 | CMP-141…144, 148 |
| `CAMP_4` | `[Img1, Img2, Img3, Img4]` | 4 | Spec CampC |
| `CAMP_MIXED` | `[Img1, Vid1, Wid1]` | 3 | CMP-030, EDGE-007 |
| `CAMP_A` + `CAMP_B` | `[A1,A2]` + `[B1,B2,B3]` | LCM 6 | CMP-149, 150 |
| `CAMP_2_3_4` | lengths 2, 3, 4 | LCM 12 | CMP-151 |
| `CAMP_3_5` | lengths 3, 5 (coprime) | LCM 15 | EDGE-049 |
| `CAMP_LARGE` | 1,000 items | 1,000 | CMP-004, EDGE-004 |

### 20.5 Large datasets (seed via API, not the UI)

| Dataset | Size | Purpose |
|---------|------|---------|
| `DS_CAMPAIGNS_1K` | 1,000 campaigns in one folder | PERF-001, CMP-213 |
| `DS_CAMPAIGNS_5K` | 5,000 across 50 folders | PERF-002, EDGE-105 |
| `DS_ITEMS_1K` | one campaign, 1,000 items | PERF-005/006, EDGE-004 |
| `DS_PLAYLIST_100C` | playlist with 100 campaigns | EDGE-106 |
| `DS_SCREENS_100` | 100 screens in one cluster | PERF-009, CMP-100 |
| `DS_FOLDERS_DEEP` | 10-level nested folder tree | EDGE-074…076 |

### 20.6 Role / account fixtures (DEP-10)

| Account | Role | Purpose |
|---------|------|---------|
| `admin@` | Admin | Role manipulation, setup, teardown |
| `manager@` | Manager | Scoped CRUD without approve |
| `operator@` | Operator | CRUD without publish |
| `publisher@` | Publisher | Publish only |
| `approver@` | Approver | Approve/reject only |
| `viewer@` | Viewer | Read-only assertions |
| `restricted@` | Restricted User | Folder fencing |
| `tenantb@` | Admin of tenant B | Cross-tenant isolation (SEC-010, CMP-138) |

All credentials come from the gitignored `cms-e2e/.env` — never committed (repo rule, `BRANCHES.md`).

---

**Next:** [09-summary.md](09-summary.md)
