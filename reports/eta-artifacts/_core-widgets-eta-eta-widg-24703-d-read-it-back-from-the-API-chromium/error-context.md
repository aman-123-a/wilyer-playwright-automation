# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: _core\widgets\eta\eta-widget.spec.ts >> Live ETA widget — CRUD @regression >> ETA-002 @smoke create through the UI and read it back from the API
- Location: tests\_core\widgets\eta\eta-widget.spec.ts:110:3

# Error details

```
Error: expect(received).toBeDefined()

Received: undefined

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
```

# Test source

```ts
  21  | //    GET    /widget/read/{id}             single
  22  | //    POST   /widget/create                create  → 200 { message } (no id!)
  23  | //    POST   /widget/update/{id}           update
  24  | //    DELETE /widget/delete/{id}           delete
  25  | //    GET    /widget/readPublic/{id}       renderer config — unauthenticated
  26  | //
  27  | //  ── Test strategy ───────────────────────────────────────────────────────────
  28  | //  1. CRUD      — UI create/edit/delete, each settled by an API read-back.
  29  | //  2. Renderer  — what the player actually paints (the value the feature sells).
  30  | //  3. BVA       — name length, coordinate edges, destination cardinality.
  31  | //  4. Negative  — missing fields, malformed coordinates, unroutable pairs.
  32  | //  5. Security  — XSS / SQLi / NoSQL payloads, anonymous access, IDOR, headers.
  33  | //  6. API       — status codes, schema, latency.
  34  | //
  35  | //  ── Shared-server discipline ────────────────────────────────────────────────
  36  | //  •  Destructive tests skip unless CMS_ALLOW_DESTRUCTIVE=true.
  37  | //  •  Teardown removes only THIS worker's QA_ETA_* artefacts.
  38  | //  •  No colleague's widgets are ever touched.
  39  | //
  40  | //  ── Persistence rule ────────────────────────────────────────────────────────
  41  | //  Persistence is proven by API read-back, never by a toast.  Toast lifetime
  42  | //  (~11 s) exceeds a create loop, so a stale toast reads as false success.
  43  | // =============================================================================
  44  | 
  45  | import { test, expect } from '../../../../fixtures/test-fixtures';
  46  | import { EtaWidgetService, type EtaWidget } from '../../../../api/services/EtaWidgetService';
  47  | import {
  48  |   ETA_PREFIX,
  49  |   ETA_WIDGET_TYPE,
  50  |   etaUniqueName,
  51  |   place,
  52  |   PLACES,
  53  |   PLACE_QUERIES,
  54  |   validEtaPayload,
  55  |   ETA_NAMES,
  56  |   COORD_BOUNDARIES,
  57  |   MALFORMED_COORDS,
  58  |   DESTINATION_COUNTS,
  59  | } from '../../../../test-data/eta-widget.data';
  60  | 
  61  | // ── Guards ───────────────────────────────────────────────────────────────────
  62  | 
  63  | const DESTRUCTIVE = process.env.CMS_ALLOW_DESTRUCTIVE === 'true';
  64  | 
  65  | /** Call at the top of any test that writes. */
  66  | function destructive(): void {
  67  |   test.skip(!DESTRUCTIVE, 'set CMS_ALLOW_DESTRUCTIVE=true to run write tests');
  68  | }
  69  | 
  70  | /** Only this worker's artefacts, so parallel workers never fight. */
  71  | const workerPrefix = (wi: number) => `${ETA_PREFIX}w${wi}_`;
  72  | 
  73  | /** Names created during this file's run — swept in the final teardown. */
  74  | const created = new Set<string>();
  75  | const track = (name: string): string => {
  76  |   created.add(name);
  77  |   return name;
  78  | };
  79  | 
  80  | test.afterAll(async ({ browser }) => {
  81  |   if (!DESTRUCTIVE || created.size === 0) return;
  82  |   const ctx = await browser.newContext();
  83  |   try {
  84  |     const api = await EtaWidgetService.fromContext(ctx);
  85  |     const all = await api.listAll();
  86  |     for (const w of all) if (created.has(w.name)) await api.deleteQuietly(w.id);
  87  |   } finally {
  88  |     await ctx.close();
  89  |     created.clear();
  90  |   }
  91  | });
  92  | 
  93  | // =============================================================================
  94  | //  A · CRUD  (UI-driven, API-verified)
  95  | // =============================================================================
  96  | 
  97  | test.describe('Live ETA widget — CRUD @regression', () => {
  98  |   test.describe.configure({ mode: 'serial' });
  99  | 
  100 |   test('ETA-001 @smoke Live ETA type tile is reachable and the grid loads', async ({
  101 |     etaWidgetPage,
  102 |   }) => {
  103 |     await etaWidgetPage.open();
  104 |     // Either populated or an honest empty state — both mean the grid loaded.
  105 |     await expect(
  106 |       etaWidgetPage.widgetCards.first().or(etaWidgetPage.emptyState.first()),
  107 |     ).toBeVisible();
  108 |   });
  109 | 
  110 |   test('ETA-002 @smoke create through the UI and read it back from the API', async ({
  111 |     etaWidgetPage,
  112 |     etaApi,
  113 |   }, ti) => {
  114 |     destructive();
  115 |     const name = track(etaUniqueName('create', ti.workerIndex));
  116 | 
  117 |     await etaWidgetPage.open();
  118 |     await etaWidgetPage.createWidget(name, PLACE_QUERIES.pickup, PLACE_QUERIES.destination);
  119 | 
  120 |     // Persistence is settled here, not by the toast.
> 121 |     await expect.poll(() => etaApi.findByName(name), { timeout: 20_000 }).toBeDefined();
      |                                                                           ^ Error: expect(received).toBeDefined()
  122 |     const saved = (await etaApi.findByName(name)) as EtaWidget;
  123 | 
  124 |     expect(saved.type).toBe(ETA_WIDGET_TYPE);
  125 |     expect(saved.data.pickup.location.address).toMatch(/Connaught Place/i);
  126 |     expect(saved.data.destinations).toHaveLength(1);
  127 |     expect(saved.data.destinations[0].location.address).toMatch(/Airport/i);
  128 |     // Coordinates must round-trip as numbers, not strings.
  129 |     expect(typeof saved.data.pickup.location.lat).toBe('number');
  130 |     expect(typeof saved.data.destinations[0].location.lng).toBe('number');
  131 |   });
  132 | 
  133 |   test('ETA-003 edit modal rehydrates every saved field', async ({ etaWidgetPage, etaApi }, ti) => {
  134 |     destructive();
  135 |     const name = track(etaUniqueName('edit-rehydrate', ti.workerIndex));
  136 |     await etaApi.seed(name);
  137 | 
  138 |     await etaWidgetPage.open();
  139 |     await etaWidgetPage.openEditModal(name);
  140 | 
  141 |     await expect(etaWidgetPage.nameInput('update')).toHaveValue(name);
  142 |     await expect(etaWidgetPage.pickupInput('update')).toHaveValue(/Connaught Place/i);
  143 |     await expect(etaWidgetPage.destinationInput(1, 'update')).toHaveValue(/Airport/i);
  144 |   });
  145 | 
  146 |   test('ETA-004 @smoke edit modal computes a live ETA and distance', async ({
  147 |     etaWidgetPage,
  148 |     etaApi,
  149 |   }, ti) => {
  150 |     destructive();
  151 |     const name = track(etaUniqueName('edit-eta', ti.workerIndex));
  152 |     await etaApi.seed(name);
  153 | 
  154 |     await etaWidgetPage.open();
  155 |     await etaWidgetPage.openEditModal(name);
  156 | 
  157 |     // This is the whole point of the feature — a real duration and distance.
  158 |     await expect
  159 |       .poll(() => etaWidgetPage.computedEtaText('update'), { timeout: 25_000 })
  160 |       .not.toBeNull();
  161 | 
  162 |     const eta = (await etaWidgetPage.computedEtaText('update')) as string;
  163 |     expect(eta, 'edit modal must show "<duration> · <distance>"').toMatch(/\d+\s*(min|hour|hr)/i);
  164 |     expect(eta).toMatch(/[\d.]+\s*(km|mi|m)\b/i);
  165 |   });
  166 | 
  167 |   test('ETA-005 rename persists', async ({ etaWidgetPage, etaApi }, ti) => {
  168 |     destructive();
  169 |     const name = track(etaUniqueName('rename', ti.workerIndex));
  170 |     const renamed = track(`${name}_EDITED`);
  171 |     await etaApi.seed(name);
  172 | 
  173 |     await etaWidgetPage.open();
  174 |     await etaWidgetPage.openEditModal(name);
  175 |     await etaWidgetPage.fillName(renamed, 'update');
  176 |     await etaWidgetPage.save('update');
  177 | 
  178 |     await expect.poll(() => etaApi.findByName(renamed), { timeout: 20_000 }).toBeDefined();
  179 |     expect(await etaApi.findByName(name), 'old name must no longer exist').toBeUndefined();
  180 |   });
  181 | 
  182 |   test('ETA-006 add a second destination through the UI', async ({ etaWidgetPage, etaApi }, ti) => {
  183 |     destructive();
  184 |     const name = track(etaUniqueName('add-dest', ti.workerIndex));
  185 |     await etaApi.seed(name);
  186 | 
  187 |     await etaWidgetPage.open();
  188 |     await etaWidgetPage.openEditModal(name);
  189 |     await etaWidgetPage.addDestination('update');
  190 |     await etaWidgetPage.chooseDestination(PLACE_QUERIES.destination2, 2, 'update');
  191 |     await etaWidgetPage.save('update');
  192 | 
  193 |     await expect
  194 |       .poll(async () => (await etaApi.findByName(name))?.data.destinations.length, {
  195 |         timeout: 20_000,
  196 |       })
  197 |       .toBe(2);
  198 |   });
  199 | 
  200 |   test('ETA-007 cancelling the create modal persists nothing', async ({
  201 |     etaWidgetPage,
  202 |     etaApi,
  203 |   }, ti) => {
  204 |     const name = etaUniqueName('cancelled', ti.workerIndex);
  205 | 
  206 |     await etaWidgetPage.open();
  207 |     await etaWidgetPage.openCreateModal();
  208 |     await etaWidgetPage.fillName(name);
  209 |     await etaWidgetPage.cancel();
  210 | 
  211 |     await expect(etaWidgetPage.createModal).toBeHidden();
  212 |     expect(await etaApi.findByName(name)).toBeUndefined();
  213 |   });
  214 | 
  215 |   test('ETA-008 delete confirmation names the widget being deleted', async ({
  216 |     etaWidgetPage,
  217 |     etaApi,
  218 |   }, ti) => {
  219 |     destructive();
  220 |     const name = track(etaUniqueName('delete-prompt', ti.workerIndex));
  221 |     await etaApi.seed(name);
```