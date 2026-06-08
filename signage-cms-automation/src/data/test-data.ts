// =============================================================================
//  Test-data management — static fixtures + dynamic, collision-free generators
//  for create/edit flows. Keeping data here makes specs declarative and lets us
//  swap datasets per environment without touching test logic.
// =============================================================================

import { ENV } from '../config/env';

/** Unique, timestamped suffix so parallel runs never clash on names. */
export const uniqueSuffix = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const name = (prefix: string): string => `${prefix}-e2e-${uniqueSuffix()}`;

/** Sample media files for upload tests — provided under src/data/media/. */
export const MEDIA = {
  jpg: 'src/data/media/sample.jpg',
  png: 'src/data/media/sample.png',
  mp4: 'src/data/media/sample.mp4',
  pdf: 'src/data/media/sample.pdf',
  unsupported: 'src/data/media/sample.exe',
} as const;

/** Re-export credentials so specs import a single data module. */
export const USERS = {
  admin: ENV.ADMIN,
} as const;

export default { uniqueSuffix, name, MEDIA, USERS };
