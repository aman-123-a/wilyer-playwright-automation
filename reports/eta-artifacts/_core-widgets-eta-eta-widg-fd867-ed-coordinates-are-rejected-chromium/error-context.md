# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: _core\widgets\eta\eta-widget.spec.ts >> Live ETA widget — negative @negative >> ETA-055-numeric-strings malformed coordinates are rejected
- Location: tests\_core\widgets\eta\eta-widget.spec.ts:577:5

# Error details

```
Error: numeric-strings must not be stored

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 400
Received:    200
```

# Test source

```ts
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
> 591 |       expect(res.status(), `${c.id} must not be stored`).toBeGreaterThanOrEqual(400);
      |                                                          ^ Error: numeric-strings must not be stored
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
  646 |     await etaWidgetPage.page.waitForTimeout(8_000);
  647 | 
  648 |     expect(await etaWidgetPage.updateModal.innerText()).not.toMatch(
  649 |       /\bNaN\b|\bundefined\b|Infinity/,
  650 |     );
  651 |   });
  652 | });
  653 | 
  654 | // =============================================================================
  655 | //  E · Security
  656 | // =============================================================================
  657 | 
  658 | test.describe('Live ETA widget — security @security', () => {
  659 |   const INJECTIONS = [
  660 |     ['xss', ETA_NAMES.xss],
  661 |     ['xss-img', ETA_NAMES.xssImg],
  662 |     ['sqli', ETA_NAMES.sqlish],
  663 |     ['nosql', ETA_NAMES.nosql],
  664 |     ['template', ETA_NAMES.template],
  665 |     ['traversal', ETA_NAMES.traversal],
  666 |     ['unicode', ETA_NAMES.unicode],
  667 |   ] as const;
  668 | 
  669 |   for (const [key, payload] of INJECTIONS) {
  670 |     test(`ETA-060-${key} injection payload in the name is stored inert`, async ({
  671 |       etaWidgetPage,
  672 |       etaApi,
  673 |     }, ti) => {
  674 |       destructive();
  675 |       const name = `${workerPrefix(ti.workerIndex)}${payload}`;
  676 | 
  677 |       const res = await etaApi.createRaw(validEtaPayload(name));
  678 |       expect(res.status(), 'an injection payload must never 500 the API').not.toBe(500);
  679 |       test.skip(!res.ok(), `server rejected the payload with ${res.status()} — also acceptable`);
  680 |       track(name);
  681 | 
  682 |       expect(
  683 |         (await etaApi.findByName(name))?.name,
  684 |         'payload must round-trip literally, not partially stripped',
  685 |       ).toBe(name);
  686 | 
  687 |       await etaWidgetPage.open();
  688 |       expect(
  689 |         await etaWidgetPage.cardScriptsExecuted(name),
  690 |         'payload executed instead of rendering as text',
  691 |       ).toBe(false);
```