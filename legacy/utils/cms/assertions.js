// =============================================================================
//  assertions — reusable, semantic expectations shared across specs.
// =============================================================================

import { expect } from '@playwright/test';

/**
 * Lightweight schema validator (no external dep). `schema` maps field -> type
 * descriptor: 'string' | 'number' | 'boolean' | 'array' | 'object' | a RegExp
 * (matched against String(value)) | a predicate fn (value) => boolean.
 * Optional fields end with '?'.
 */
export function validateSchema(obj, schema, pathLabel = 'root') {
  const errors = [];
  for (const [rawKey, rule] of Object.entries(schema)) {
    const optional = rawKey.endsWith('?');
    const key = optional ? rawKey.slice(0, -1) : rawKey;
    const has = obj != null && Object.prototype.hasOwnProperty.call(obj, key);
    if (!has) {
      if (!optional) errors.push(`${pathLabel}.${key} is missing`);
      continue;
    }
    const val = obj[key];
    if (!matchesRule(val, rule)) {
      errors.push(`${pathLabel}.${key} failed rule (${describeRule(rule)}), got ${typeof val} ${JSON.stringify(val)?.slice(0, 40)}`);
    }
  }
  return errors;
}

function matchesRule(val, rule) {
  if (rule instanceof RegExp) return rule.test(String(val));
  if (typeof rule === 'function') return !!rule(val);
  switch (rule) {
    case 'string': return typeof val === 'string';
    case 'number': return typeof val === 'number' && !Number.isNaN(val);
    case 'boolean': return typeof val === 'boolean';
    case 'array': return Array.isArray(val);
    case 'object': return val !== null && typeof val === 'object' && !Array.isArray(val);
    default: return true;
  }
}

function describeRule(rule) {
  if (rule instanceof RegExp) return rule.toString();
  if (typeof rule === 'function') return 'predicate';
  return String(rule);
}

/** Assert an object matches the schema; throws with all violations. */
export function expectSchema(obj, schema, label = 'response') {
  const errors = validateSchema(obj, schema, label);
  expect(errors, `Schema violations:\n${errors.join('\n')}`).toHaveLength(0);
}

/** Assert an HTTP status is in a set of acceptable codes. */
export function expectStatusIn(status, allowed, label = 'request') {
  expect(allowed, `${label}: status ${status} not in [${allowed.join(', ')}]`).toContain(status);
}

/** Assert a response time is under a budget. */
export function expectResponseUnder(ms, budgetMs, label = 'response') {
  expect(ms, `${label}: ${ms}ms exceeded budget ${budgetMs}ms`).toBeLessThan(budgetMs);
}

export default { validateSchema, expectSchema, expectStatusIn, expectResponseUnder };
