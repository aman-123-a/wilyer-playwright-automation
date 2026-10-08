// =============================================================================
//  Test-data management — static fixtures + dynamic, collision-free generators
//  for create/edit flows. Keeping all data here makes specs declarative and
//  lets us swap datasets per environment without touching test logic.
// =============================================================================

import { ENV } from '../config/env';

/** Unique, timestamped suffix so parallel runs never clash on names. */
export const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const name = (prefix: string): string => `${prefix}-e2e-${uniqueSuffix()}`;

/** Negative / edge-case auth inputs reused across security tests. */
export const AUTH_PAYLOADS = {
  invalidEmailFormat: 'not-an-email',
  sqlInjection: "' OR '1'='1' --",
  xss: '<script>alert("xss")</script>',
  largeInput: 'a'.repeat(5_000),
  specialChars: '!@#$%^&*()_+{}|:"<>?`~',
  wrongPassword: 'definitely-wrong-password-123',
} as const;

/** Sample media files for upload tests — provided under data/media/. */
export const MEDIA = {
  validImage: 'data/media/sample.jpg',
  validVideo: 'data/media/sample.mp4',
  unsupported: 'data/media/sample.exe',
  large: 'data/media/large.bin',
} as const;

/** Re-export credentials so specs import a single data module. */
export const USERS = {
  admin: ENV.ADMIN,
  subuser: ENV.SUBUSER,
} as const;

export default { uniqueSuffix, name, AUTH_PAYLOADS, MEDIA, USERS };
