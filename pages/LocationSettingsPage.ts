// =============================================================================
//  LocationSettingsPage — Screen Configuration → Location Settings.
//
//  Reached from a screen's settings page (/screen-settings/<id>) via the
//  "Configurations" tab. Owns every selector for the location form so the
//  data-driven suite in tests/screens/boundary stays a list of cases and
//  expectations.
//
//  NON-DESTRUCTIVE: this object deliberately exposes NO save action, so it
//  cannot mutate a live screen's stored configuration.
//
//  Selectors verified live:
//   • Fields are matched by exact placeholder (see LOCATION_FIELDS).
//   • Google Places suggestions render as `.pac-item` in a detached container.
//   • The map exposes its centre through the "Open this area in Google Maps"
//     link's `?ll=<lat>,<lng>` query.
// =============================================================================

import { type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { LOCATION_FIELDS, type LocationField } from '../test-data/location-settings.data';

export class LocationSettingsPage extends BasePage {
  readonly configurationsTab: Locator;
  readonly heading: Locator;
  readonly autocompleteSuggestions: Locator;
  readonly mapLink: Locator;

  constructor(page: BasePage['page']) {
    super(page);
    this.configurationsTab = page.getByRole('link', { name: 'Configurations' }).first();
    this.heading = page.getByRole('heading', { name: /location settings/i });
    this.autocompleteSuggestions = page.locator('.pac-item');
    this.mapLink = page.locator('a[href*="maps.google.com/maps?ll="]').first();
  }

  /** Open a screen's Configurations tab and wait for the location form. */
  async open(screenId: string): Promise<this> {
    await this.goto(`/screen-settings/${screenId}`);
    await this.configurationsTab.click();
    await expect(this.heading).toBeVisible({ timeout: 20_000 });
    return this;
  }

  /** A location form input, addressed by its exact placeholder. */
  field(key: LocationField): Locator {
    return this.page.getByPlaceholder(LOCATION_FIELDS[key], { exact: true });
  }

  async fillField(key: LocationField, value: string): Promise<this> {
    await this.field(key).fill(value);
    return this;
  }

  /** Fill a field and blur it, which is what triggers inline validation. */
  async fillAndBlur(key: LocationField, value: string): Promise<this> {
    await this.fillField(key, value);
    await this.page.keyboard.press('Tab');
    return this;
  }

  async fieldValue(key: LocationField): Promise<string> {
    return this.field(key).inputValue();
  }

  /**
   * Type into the Location box and accept the first Google Places suggestion,
   * which is what auto-fills city/state/country and re-centres the map.
   */
  async chooseFirstSuggestion(query: string): Promise<this> {
    const loc = this.field('location');
    await loc.click();
    await this.page.keyboard.press('ControlOrMeta+a');
    await this.page.keyboard.press('Delete');
    await loc.pressSequentially(query, { delay: 60 });
    await expect(this.autocompleteSuggestions.first()).toBeVisible({ timeout: 8_000 });
    await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');
    return this;
  }

  /** Enter coordinates manually and blur, so the map recentres. */
  async setCoordinates(latitude: string, longitude: string): Promise<this> {
    await this.fillField('latitude', latitude);
    await this.fillField('longitude', longitude);
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(1_500); // map recentre animation
    return this;
  }

  /** Current map centre ("lat,lng"), read from the Google Maps link. */
  async mapCenter(): Promise<string | null> {
    const href = await this.mapLink.getAttribute('href').catch(() => null);
    return href ? (href.match(/ll=([^&]+)/)?.[1] ?? null) : null;
  }

  /** True if any inline validation error is shown for `key`'s field group. */
  async hasInlineError(key: LocationField): Promise<boolean> {
    const input = this.field(key);
    if ((await input.getAttribute('aria-invalid').catch(() => null)) === 'true') return true;
    // Error text renders as a sibling within the same field group.
    const group = input.locator('xpath=ancestor::*[self::div][1]');
    const err = group.getByText(/invalid|required|must be|between|valid|error/i);
    return (
      (await err.count()) > 0 &&
      (await err
        .first()
        .isVisible()
        .catch(() => false))
    );
  }

  /**
   * Fill a field with an injection payload and report whether it executed.
   * A `dialog` listener is the observable signal — a payload that fires
   * alert()/confirm() proves the input was evaluated rather than escaped.
   */
  async payloadExecutes(key: LocationField, payload: string): Promise<boolean> {
    const dialogFired = this.watchDialogs();
    await this.fillAndBlur(key, payload);
    await this.page.waitForTimeout(500); // give any handler a beat to fire
    return dialogFired();
  }

  /** Resize and report whether the layout overflows horizontally. */
  async overflowsAt(width: number, height: number): Promise<boolean> {
    await this.page.setViewportSize({ width, height });
    await this.page.waitForTimeout(300); // reflow
    return this.hasHorizontalOverflow();
  }
}

export default LocationSettingsPage;
