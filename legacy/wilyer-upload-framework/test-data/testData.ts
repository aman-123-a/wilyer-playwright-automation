/**
 * Workflow test-data: rejection reasons, unique file-name generators, and
 * timeout presets shared across specs.
 */
export const RejectionReasons = {
  default: 'Rejected by automated checker test — content does not meet guidelines.',
  policy: 'File violates upload policy (automated test).',
  quality: 'Low quality / corrupted preview (automated test).',
} as const;

/** Generate a unique, traceable file name so parallel runs never collide. */
export function uniqueFileName(prefix = 'auto', ext = 'png'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${rand}.${ext}`;
}

export const Timeouts = {
  short: 5_000,
  medium: 15_000,
  long: 30_000,
  emailPoll: 60_000,
} as const;
