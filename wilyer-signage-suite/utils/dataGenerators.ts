// =============================================================================
//  Test-data generators — deterministic-ish, dependency-free (no faker).
// =============================================================================
//  Every generated entity is tagged with a unique run id so parallel workers
//  never collide and cleanup can target `e2e-` prefixed records.
// =============================================================================

/** A short, time-based run id. Unique enough across parallel workers. */
export function runId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e6).toString(36);
  return `${t}${r}`.slice(-8);
}

export const PREFIX = 'e2e';

/** Repeat a base string up to `len` characters. */
export function stringOfLength(len: number, fill = 'a'): string {
  if (len <= 0) return '';
  return fill.repeat(Math.ceil(len / fill.length)).slice(0, len);
}

/** Boundary-value fixtures for a text field with a [min,max] length contract. */
export function boundaryStrings(min: number, max: number) {
  return {
    empty: '',
    belowMin: min > 1 ? stringOfLength(min - 1) : '',
    min: stringOfLength(min),
    nominal: stringOfLength(Math.floor((min + max) / 2)),
    max: stringOfLength(max),
    aboveMax: stringOfLength(max + 1),
  };
}

/** Strings that exercise input sanitisation / encoding. */
export const SPECIAL_STRINGS = {
  specialChars: `!@#$%^&*()_+-=[]{}|;:'",.<>/?` + '`~',
  unicode: 'スクリーン_📺_Ñoño_Привет_界面',
  emoji: '🚀🔥✅🎉📺🟢',
  leadingTrailingSpace: '   padded name   ',
  sqlInjection: `Robert'); DROP TABLE screens;--`,
  xss: `<img src=x onerror=alert('xss')><script>alert(1)</script>`,
  htmlEntities: '&lt;b&gt;bold&lt;/b&gt; &amp; more',
  rtl: 'شاشة العرض',
  longName: stringOfLength(512),
} as const;

export interface ScreenData {
  name: string;
  pairingCode: string;
  tags: string[];
}
export function screen(overrides: Partial<ScreenData> = {}): ScreenData {
  const id = runId();
  return {
    name: `${PREFIX}-screen-${id}`,
    pairingCode: id.toUpperCase().slice(0, 6),
    tags: [`${PREFIX}-tag-${id}`],
    ...overrides,
  };
}

export interface GroupData {
  name: string;
  description: string;
}
export function group(overrides: Partial<GroupData> = {}): GroupData {
  const id = runId();
  return { name: `${PREFIX}-group-${id}`, description: `auto group ${id}`, ...overrides };
}

export interface ClusterData {
  name: string;
}
export function cluster(overrides: Partial<ClusterData> = {}): ClusterData {
  return { name: `${PREFIX}-cluster-${runId()}`, ...overrides };
}

export interface PlaylistData {
  name: string;
  folder?: string;
}
export function playlist(overrides: Partial<PlaylistData> = {}): PlaylistData {
  return { name: `${PREFIX}-playlist-${runId()}`, ...overrides };
}

export interface RolloutData {
  name: string;
  description: string;
}
export function rollout(overrides: Partial<RolloutData> = {}): RolloutData {
  const id = runId();
  return { name: `${PREFIX}-rollout-${id}`, description: `auto rollout ${id}`, ...overrides };
}

export interface MemberData {
  name: string;
  email: string;
  password: string;
}
export function member(overrides: Partial<MemberData> = {}): MemberData {
  const id = runId();
  return {
    name: `${PREFIX} Member ${id}`,
    email: `${PREFIX}.${id}@example.com`,
    password: 'Str0ng!Pass123',
    ...overrides,
  };
}

export interface RoleData {
  name: string;
}
export function role(overrides: Partial<RoleData> = {}): RoleData {
  return { name: `${PREFIX}-role-${runId()}`, ...overrides };
}

/** Email fixtures for validation tests. */
export const EMAILS = {
  valid: () => `${PREFIX}.${runId()}@example.com`,
  noAt: 'plainaddress.example.com',
  noDomain: 'name@',
  noLocal: '@example.com',
  spaces: 'na me@exam ple.com',
  doubleDot: 'name@example..com',
  unicode: 'tëst@exämple.com',
} as const;

/** Password fixtures keyed to a typical 8..64 policy. */
export const PASSWORDS = {
  tooShort: 'Ab1!',
  min: 'Abcd123!',
  max: stringOfLength(64, 'Ab1!cd2@'),
  aboveMax: stringOfLength(65, 'Ab1!cd2@'),
  noNumber: 'Abcdefgh!',
  noSpecial: 'Abcdefgh1',
} as const;

/** Numeric boundary fixtures (volume, rotation, intervals). */
export const NUMERIC = {
  volume: { min: 0, max: 100, belowMin: -1, aboveMax: 101 },
  rotation: { valid: [0, 90, 180, 270], invalid: [45, 360, -90, 1] },
  // Notification interval contract is app-specific — adjust min/max as confirmed.
  interval: { min: 1, max: 1440, belowMin: 0, aboveMax: 100000 },
} as const;
