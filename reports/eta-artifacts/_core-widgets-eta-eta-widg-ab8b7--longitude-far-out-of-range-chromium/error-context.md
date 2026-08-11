# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: _core\widgets\eta\eta-widget.spec.ts >> Live ETA widget — BVA @boundary >> ETA-035-lng-absurd coordinate boundary: longitude far out of range
- Location: tests\_core\widgets\eta\eta-widget.spec.ts:447:5

# Error details

```
Error: longitude far out of range must be rejected

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 400
Received:    200
```

# Test source

```ts
  358 |   test('ETA-024 renderer for a non-existent id fails safely', async ({ etaWidgetPage }) => {
  359 |     await etaWidgetPage.openRenderer('000000000000000000000000');
  360 |     await etaWidgetPage.page.waitForTimeout(5_000);
  361 | 
  362 |     expect(await etaWidgetPage.rendererText()).not.toMatch(/\bundefined\b|\bNaN\b|stack trace/i);
  363 |   });
  364 | 
  365 |   test('ETA-025 renderer does not print a Maps API key as visible text', async ({
  366 |     etaWidgetPage,
  367 |     etaApi,
  368 |   }, ti) => {
  369 |     destructive();
  370 |     const seeded = await etaApi.seed(track(etaUniqueName('render-key', ti.workerIndex)));
  371 | 
  372 |     await etaWidgetPage.openRenderer(seeded.id);
  373 |     await etaWidgetPage.page.waitForTimeout(5_000);
  374 | 
  375 |     expect(
  376 |       await etaWidgetPage.rendererText(),
  377 |       'API key must never be rendered as visible text',
  378 |     ).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  379 |   });
  380 | 
  381 |   test('ETA-026 renderer polling does not stampede the config endpoint', async ({
  382 |     etaWidgetPage,
  383 |     etaApi,
  384 |   }, ti) => {
  385 |     destructive();
  386 |     const seeded = await etaApi.seed(track(etaUniqueName('render-poll', ti.workerIndex)));
  387 | 
  388 |     let configCalls = 0;
  389 |     await etaWidgetPage.page.route(/\/widget\/readPublic\//, (r) => {
  390 |       configCalls += 1;
  391 |       return r.continue();
  392 |     });
  393 | 
  394 |     await etaWidgetPage.openRenderer(seeded.id);
  395 |     await etaWidgetPage.page.waitForTimeout(30_000);
  396 | 
  397 |     // 30 s of runtime should not need more than a handful of config reads.
  398 |     expect(configCalls, `readPublic called ${configCalls}× in 30 s`).toBeLessThanOrEqual(6);
  399 |   });
  400 | });
  401 | 
  402 | // =============================================================================
  403 | //  C · Boundary value analysis
  404 | // =============================================================================
  405 | 
  406 | test.describe('Live ETA widget — BVA @boundary', () => {
  407 |   test('ETA-030 empty name is rejected', async ({ etaApi }) => {
  408 |     const res = await etaApi.createRaw(validEtaPayload(ETA_NAMES.blank));
  409 |     expect(res.status(), 'blank name must not create a widget').toBeGreaterThanOrEqual(400);
  410 |   });
  411 | 
  412 |   test('ETA-031 whitespace-only name is rejected', async ({ etaApi }) => {
  413 |     expect(
  414 |       (await etaApi.createRaw(validEtaPayload(ETA_NAMES.whitespace))).status(),
  415 |     ).toBeGreaterThanOrEqual(400);
  416 |   });
  417 | 
  418 |   test('ETA-032 single-character name is accepted', async ({ etaApi }, ti) => {
  419 |     destructive();
  420 |     const name = track(`${workerPrefix(ti.workerIndex)}A`);
  421 |     expect((await etaApi.createRaw(validEtaPayload(name))).ok()).toBe(true);
  422 |     expect(await etaApi.findByName(name)).toBeDefined();
  423 |   });
  424 | 
  425 |   test('ETA-033 a 255-char name round-trips untruncated', async ({ etaApi }, ti) => {
  426 |     destructive();
  427 |     const name = `${workerPrefix(ti.workerIndex)}${ETA_NAMES.at255}`.slice(0, 255);
  428 |     const res = await etaApi.createRaw(validEtaPayload(name));
  429 |     test.skip(!res.ok(), `server caps the name below 255 (status ${res.status()})`);
  430 |     track(name);
  431 | 
  432 |     expect((await etaApi.findByName(name))?.name, 'name must not be silently truncated').toBe(name);
  433 |   });
  434 | 
  435 |   test('ETA-034 an absurdly long name (5 000 chars) is bounded', async ({ etaApi }, ti) => {
  436 |     const name = `${workerPrefix(ti.workerIndex)}${ETA_NAMES.huge}`;
  437 |     const res = await etaApi.createRaw(validEtaPayload(name));
  438 |     if (res.ok()) track(name);
  439 | 
  440 |     expect(
  441 |       res.status(),
  442 |       'an unbounded name field is a storage/DoS hazard — expect a 4xx',
  443 |     ).toBeGreaterThanOrEqual(400);
  444 |   });
  445 | 
  446 |   for (const c of COORD_BOUNDARIES) {
  447 |     test(`ETA-035-${c.id} coordinate boundary: ${c.note}`, async ({ etaApi }, ti) => {
  448 |       const name = etaUniqueName(`coord-${c.id}`, ti.workerIndex);
  449 |       const payload = validEtaPayload(name);
  450 |       payload.data.destinations = [place(c.lat, c.lng, `boundary probe ${c.id}`)];
  451 | 
  452 |       const res = await etaApi.createRaw(payload);
  453 |       if (res.ok()) track(name);
  454 | 
  455 |       if (c.valid) {
  456 |         expect(res.ok(), `${c.note} is in range and must be accepted`).toBe(true);
  457 |       } else {
> 458 |         expect(res.status(), `${c.note} must be rejected`).toBeGreaterThanOrEqual(400);
      |                                                            ^ Error: longitude far out of range must be rejected
  459 |       }
  460 |     });
  461 |   }
  462 | 
  463 |   test('ETA-036 zero destinations is rejected', async ({ etaApi }, ti) => {
  464 |     const payload = validEtaPayload(etaUniqueName('no-dest', ti.workerIndex));
  465 |     payload.data.destinations = [];
  466 |     expect((await etaApi.createRaw(payload)).status()).toBeGreaterThanOrEqual(400);
  467 |   });
  468 | 
  469 |   test('ETA-037 ten destinations are accepted and all persist', async ({ etaApi }, ti) => {
  470 |     destructive();
  471 |     const name = etaUniqueName('ten-dest', ti.workerIndex);
  472 |     const payload = validEtaPayload(name);
  473 |     payload.data.destinations = Array.from({ length: DESTINATION_COUNTS.ten }, (_, i) =>
  474 |       place(28.5 + i / 100, 77.1 + i / 100, `Destination ${i + 1}, New Delhi`),
  475 |     );
  476 | 
  477 |     const res = await etaApi.createRaw(payload);
  478 |     test.skip(!res.ok(), `server caps destinations below 10 (status ${res.status()})`);
  479 |     track(name);
  480 | 
  481 |     expect((await etaApi.findByName(name))?.data.destinations).toHaveLength(DESTINATION_COUNTS.ten);
  482 |   });
  483 | 
  484 |   test('ETA-038 500 destinations are bounded, not silently stored', async ({ etaApi }, ti) => {
  485 |     const name = etaUniqueName('flood-dest', ti.workerIndex);
  486 |     const payload = validEtaPayload(name);
  487 |     payload.data.destinations = Array.from({ length: DESTINATION_COUNTS.fiveHundred }, () =>
  488 |       PLACES.delhiAirport(),
  489 |     );
  490 | 
  491 |     const res = await etaApi.createRaw(payload);
  492 |     if (res.ok()) track(name);
  493 | 
  494 |     expect(
  495 |       res.status(),
  496 |       'unbounded destinations means unbounded routing spend on every refresh',
  497 |     ).toBeGreaterThanOrEqual(400);
  498 |   });
  499 | 
  500 |   test('ETA-039 pagination limit above the server ceiling is a 400, not a clamp', async ({
  501 |     etaApi,
  502 |   }) => {
  503 |     expect((await etaApi.listRaw({ limit: 100_000 })).status()).toBeGreaterThanOrEqual(400);
  504 |   });
  505 | 
  506 |   test('ETA-040 page beyond the last returns an empty set, not an error', async ({ etaApi }) => {
  507 |     const res = await etaApi.listRaw({ page: 99_999, limit: 10 });
  508 |     expect(res.ok()).toBe(true);
  509 |     expect((await res.json()).docs).toEqual([]);
  510 |   });
  511 | });
  512 | 
  513 | // =============================================================================
  514 | //  D · Negative paths
  515 | // =============================================================================
  516 | 
  517 | test.describe('Live ETA widget — negative @negative', () => {
  518 |   test('ETA-050 saving an empty create form persists nothing', async ({
  519 |     etaWidgetPage,
  520 |     etaApi,
  521 |   }) => {
  522 |     const before = await etaApi.count();
  523 | 
  524 |     await etaWidgetPage.open();
  525 |     await etaWidgetPage.openCreateModal();
  526 |     await etaWidgetPage.save();
  527 | 
  528 |     // The modal staying open is the product's (silent) rejection signal.
  529 |     await expect(etaWidgetPage.createModal).toBeVisible();
  530 |     expect(await etaApi.count()).toBe(before);
  531 |   });
  532 | 
  533 |   test('ETA-051 empty create form surfaces an actionable validation message', async ({
  534 |     etaWidgetPage,
  535 |   }) => {
  536 |     await etaWidgetPage.open();
  537 |     await etaWidgetPage.openCreateModal();
  538 |     await etaWidgetPage.save();
  539 | 
  540 |     // Known gap in v3.5.25: the rejection is silent. Asserted honestly so the
  541 |     // suite reports the day it is fixed — and today, why it is not.
  542 |     expect(
  543 |       await etaWidgetPage.hasInlineError(etaWidgetPage.nameInput()),
  544 |       'no inline error on empty submit — the user gets no feedback at all',
  545 |     ).toBe(true);
  546 |   });
  547 | 
  548 |   test('ETA-052 missing pickup is rejected by the API', async ({ etaApi }, ti) => {
  549 |     const res = await etaApi.createRaw({
  550 |       name: etaUniqueName('no-pickup', ti.workerIndex),
  551 |       data: { destinations: [PLACES.delhiAirport()] },
  552 |       type: ETA_WIDGET_TYPE,
  553 |       faceId: 1,
  554 |       faceUrl: '/media/widgets/google-maps.png',
  555 |     });
  556 |     expect(res.status()).toBeGreaterThanOrEqual(400);
  557 |   });
  558 | 
```