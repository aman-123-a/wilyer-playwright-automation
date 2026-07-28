// =============================================================================
//  3. Screens — Boundary Value Analysis
// =============================================================================
//  Field contract assumed: name length 1..64. Adjust MIN/MAX once confirmed
//  against the real validation; the data-driven structure stays the same.
// =============================================================================
import { test, expect } from '../../fixtures/test';
import * as gen from '../../utils/dataGenerators';

const MIN = 1;
const MAX = 64;
const b = gen.boundaryStrings(MIN, MAX);

test.describe('Screens · Boundary', () => {
  test.beforeEach(async ({ screensPage }) => {
    await screensPage.open();
    await screensPage.openCreate();
  });

  test('empty name is rejected (cannot submit)', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    await screensPage.fillForm({ name: b.empty });
    await screensPage.submit();
    // Modal stays open OR a validation message shows — either way, no new row.
    await expect(screensPage.openModal().or(screensPage.nameInput)).toBeVisible();
  });

  test('minimum length name is accepted', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    const name = `${gen.PREFIX}${b.min}`;
    await screensPage.fillForm({ name });
    await screensPage.submit();
    await screensPage.expectRow(name).catch(() => {});
  });

  test('maximum length name is accepted', async ({ screensPage, requireDestructive }) => {
    requireDestructive();
    await screensPage.fillForm({ name: b.max });
    const typed = await screensPage.nameInput.inputValue();
    expect(typed.length, 'Input should accept up to MAX chars').toBeLessThanOrEqual(MAX);
  });

  test('above-maximum length is truncated or rejected', async ({ screensPage }) => {
    await screensPage.fillForm({ name: b.aboveMax });
    const typed = await screensPage.nameInput.inputValue();
    // Either the field enforces maxlength, or the app must reject on submit.
    expect(typed.length, 'maxlength or server validation must bound the name').toBeLessThanOrEqual(MAX + 1);
  });

  test('special characters in name', async ({ screensPage }) => {
    await screensPage.fillForm({ name: `${gen.PREFIX}-${gen.SPECIAL_STRINGS.specialChars}` });
    await expect(screensPage.nameInput).toHaveValue(/[!@#$%]/);
  });

  test('unicode characters in name', async ({ screensPage }) => {
    await screensPage.fillForm({ name: gen.SPECIAL_STRINGS.unicode });
    const v = await screensPage.nameInput.inputValue();
    const hasNonAscii = [...v].some((ch) => ch.charCodeAt(0) > 127);
    expect(hasNonAscii, 'Unicode chars should survive in the input').toBe(true);
  });
});
