# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: _core\widgets\eta\eta-widget.spec.ts >> Live ETA widget — negative @negative >> ETA-051 empty create form surfaces an actionable validation message
- Location: tests\_core\widgets\eta\eta-widget.spec.ts:533:3

# Error details

```
Error: no inline error on empty submit — the user gets no feedback at all

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
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
  458 |         expect(res.status(), `${c.note} must be rejected`).toBeGreaterThanOrEqual(400);
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
> 545 |     ).toBe(true);
      |       ^ Error: no inline error on empty submit — the user gets no feedback at all
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
  559 |   test('ETA-053 missing name is rejected by the API', async ({ etaApi }) => {
  560 |     const payload = validEtaPayload('x') as unknown as Record<string, unknown>;
  561 |     delete payload.name;
  562 |     expect((await etaApi.createRaw(payload)).status()).toBeGreaterThanOrEqual(400);
  563 |   });
  564 | 
  565 |   test('ETA-054 empty data object is rejected', async ({ etaApi }, ti) => {
  566 |     const res = await etaApi.createRaw({
  567 |       name: etaUniqueName('no-data', ti.workerIndex),
  568 |       data: {},
  569 |       type: ETA_WIDGET_TYPE,
  570 |       faceId: 1,
  571 |       faceUrl: '/media/widgets/google-maps.png',
  572 |     });
  573 |     expect(res.status()).toBeGreaterThanOrEqual(400);
  574 |   });
  575 | 
  576 |   for (const c of MALFORMED_COORDS) {
  577 |     test(`ETA-055-${c.id} malformed coordinates are rejected`, async ({ etaApi }, ti) => {
  578 |       const name = etaUniqueName(`bad-${c.id}`, ti.workerIndex);
  579 |       const res = await etaApi.createRaw({
  580 |         name,
  581 |         data: {
  582 |           pickup: { location: { lat: c.lat, lng: c.lng, address: 'malformed probe' } },
  583 |           destinations: [PLACES.delhiAirport()],
  584 |         },
  585 |         type: ETA_WIDGET_TYPE,
  586 |         faceId: 1,
  587 |         faceUrl: '/media/widgets/google-maps.png',
  588 |       });
  589 |       if (res.ok()) track(name);
  590 | 
  591 |       expect(res.status(), `${c.id} must not be stored`).toBeGreaterThanOrEqual(400);
  592 |     });
  593 |   }
  594 | 
  595 |   test('ETA-056 unknown widget type is rejected', async ({ etaApi }, ti) => {
  596 |     const name = etaUniqueName('bad-type', ti.workerIndex);
  597 |     const res = await etaApi.createRaw({ ...validEtaPayload(name), type: 'notAWidgetType' });
  598 |     if (res.ok()) track(name);
  599 |     expect(res.status()).toBeGreaterThanOrEqual(400);
  600 |   });
  601 | 
  602 |   test('ETA-057 gibberish location yields no autocomplete suggestion', async ({
  603 |     etaWidgetPage,
  604 |   }) => {
  605 |     await etaWidgetPage.open();
  606 |     await etaWidgetPage.openCreateModal();
  607 | 
  608 |     expect(
  609 |       await etaWidgetPage.hasSuggestions(PLACE_QUERIES.gibberish, 1),
  610 |       'an unresolvable string must not offer a place to select',
  611 |     ).toBe(false);
  612 |   });
  613 | 
  614 |   test('ETA-058 an unroutable pair states so instead of going blank', async ({
  615 |     etaWidgetPage,
  616 |     etaApi,
  617 |   }, ti) => {
  618 |     destructive();
  619 |     const name = track(etaUniqueName('unroutable', ti.workerIndex));
  620 |     // Delhi → Reykjavik: no road route exists.
  621 |     await etaApi.seedRoute(name, PLACES.connaughtPlace(), [
  622 |       place(64.1466, -21.9426, 'Reykjavik, Iceland'),
  623 |     ]);
  624 | 
  625 |     await etaWidgetPage.open();
  626 |     await etaWidgetPage.openEditModal(name);
  627 |     await etaWidgetPage.page.waitForTimeout(8_000);
  628 | 
  629 |     const body = (await etaWidgetPage.updateModal.innerText()).replace(/\s+/g, ' ');
  630 |     expect(body, 'no-route must be stated, not left blank').toMatch(
  631 |       /no route|unavailable|not available|cannot|unreachable/i,
  632 |     );
  633 |     expect(body).not.toMatch(/\bNaN\b|\bundefined\b/);
  634 |   });
  635 | 
  636 |   test('ETA-059 identical pickup and destination render sanely', async ({
  637 |     etaWidgetPage,
  638 |     etaApi,
  639 |   }, ti) => {
  640 |     destructive();
  641 |     const name = track(etaUniqueName('same-place', ti.workerIndex));
  642 |     await etaApi.seedRoute(name, PLACES.connaughtPlace(), [PLACES.connaughtPlace()]);
  643 | 
  644 |     await etaWidgetPage.open();
  645 |     await etaWidgetPage.openEditModal(name);
```