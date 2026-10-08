// =============================================================================
//  Feature gating — declare that a suite needs a feature the target may not have.
//
//  Every server runs the same code but a different set of features (see
//  config/features.ts). A suite for a feature the target does not have must
//  SKIP, not FAIL: nothing is broken, the feature simply is not deployed there.
//
//  Call `requireFeature` at the top of a describe block:
//
//      test.describe('Prayer Schedule', () => {
//        requireFeature('prayer-schedule');
//        ...
//      });
//
//  Two layers, and they are complementary:
//
//   • This registry check is DECLARATIVE and free — it costs no page load, so a
//     suite for an absent feature is skipped before a browser is even driven.
//   • A page object's `isAvailable()` probe is EMPIRICAL — it asks the running
//     build. Where one exists (MediaSetsPage, BillingPage) keep it: the registry
//     states intent, the probe states fact, and a disagreement between the two
//     is itself a finding worth reporting.
// =============================================================================

import { test } from '@playwright/test';
import { ENV } from '../config/env';
import { resolveFeature, type FeatureName } from '../config/features';

/**
 * Skip the enclosing describe block when the active environment does not have
 * `feature`. Call it in the describe body, not inside a test.
 *
 * Unknown feature names throw rather than skip — a typo that silently disabled
 * a whole suite would be invisible in a green run.
 */
export function requireFeature(feature: FeatureName): void {
  const config = resolveFeature(feature);
  const available = config.availableOn.includes(ENV.NAME);

  test.skip(
    !available,
    `${config.label} is not deployed on ${ENV.NAME} (${ENV.LABEL}). ` +
      `Available on: ${config.availableOn.join(', ') || 'nowhere yet'}. ` +
      `Run it with: npm run ${config.owner ?? config.availableOn[0] ?? 'cms'}.`,
  );
}

/**
 * Non-throwing query for conditional logic inside a test — e.g. asserting that
 * a nav entry is absent precisely because the feature has not shipped here.
 */
export function hasFeature(feature: FeatureName): boolean {
  return resolveFeature(feature).availableOn.includes(ENV.NAME);
}
