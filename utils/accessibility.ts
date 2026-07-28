// =============================================================================
//  Accessibility helper — wraps @axe-core/playwright. Scans the current page,
//  attaches a readable violation report, and asserts no serious/critical issues.
// =============================================================================

import { type Page, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ENV } from '../config/env';

export interface A11yOptions {
  /** Only count these impact levels (default: serious + critical). */
  failOn?: Array<'minor' | 'moderate' | 'serious' | 'critical'>;
  /** CSS selectors to exclude (e.g. third-party iframes). */
  exclude?: string[];
  /**
   * Hard-fail on blocking violations. Defaults to CMS_STRICT_MONITORS so the
   * default suite warns (real apps have debt) but nightly/strict runs enforce.
   */
  hard?: boolean;
}

export async function checkA11y(page: Page, opts: A11yOptions = {}): Promise<void> {
  const failOn = opts.failOn ?? ['serious', 'critical'];

  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const sel of opts.exclude ?? ['iframe']) {
    builder = builder.exclude(sel);
  }

  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => failOn.includes(v.impact as never));

  if (results.violations.length) {
    const report = results.violations
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join('\n');
    await test.info().attach('a11y-violations', { body: report, contentType: 'text/plain' });
  }

  const hard = opts.hard ?? ENV.STRICT_MONITORS;
  if (hard) {
    expect(
      blocking,
      `serious/critical a11y violations:\n${blocking.map((v) => `${v.id}: ${v.help}`).join('\n')}`,
    ).toHaveLength(0);
  } else if (blocking.length) {
    test.info().annotations.push({
      type: 'a11y-violations',
      description: `${blocking.length} serious/critical violation(s) — see attachment`,
    });
  }
}
