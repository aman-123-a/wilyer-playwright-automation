// =============================================================================
//  Test data — edge inputs, security payloads, and API-failure scenarios.
//  Centralised so every module's spec iterates the same battery.
// =============================================================================

export interface NamedInput { name: string; value: string; }

/** §2 Edge-case inputs. The app must never crash / white-screen on any of these. */
export const EDGE_INPUTS: NamedInput[] = [
  { name: 'empty',                     value: '' },
  { name: 'single character',          value: 'a' },
  { name: 'only spaces',               value: '   ' },
  { name: 'leading/trailing spaces',   value: '  test  ' },
  { name: 'multiple inner spaces',     value: 'a    b' },
  { name: 'very long (1200 chars)',    value: 'a'.repeat(1200) },
  { name: 'special characters',        value: `!@#$%^&*()_+-=[]{};':",./<>?` },
  { name: 'unicode hi/zh/ja',          value: 'हिन्दी 中文 日本語' },
  { name: 'emoji',                     value: '😀🚀🎉' },
  { name: 'newline and tab',           value: 'a\tb\nc' },
  { name: 'url-encoded',               value: '%20%2F%3Cscript%3E' },
];

/** §3 Security payloads. Must be treated as inert text — never executed. */
export const SECURITY_PAYLOADS: NamedInput[] = [
  { name: "SQLi ' OR 1=1 --",          value: "' OR 1=1 --" },
  { name: "SQLi admin'--",             value: "admin'--" },
  { name: 'SQLi DROP TABLE',           value: "'; DROP TABLE users; --" },
  { name: 'XSS <script>',              value: '<script>alert(1)</script>' },
  { name: 'XSS img onerror',           value: '<img src=x onerror=alert(1)>' },
  { name: 'XSS svg onload',            value: '<svg/onload=alert(1)>' },
  { name: 'HTML injection',            value: '<h1 data-xss="1">injected</h1>' },
];

export interface ApiFailure {
  name: string;
  status?: number;
  body?: string;
  abort?: boolean;
  delayMs?: number;
}

/** §4 Injected API/network failures. UI must degrade gracefully (no blank). */
export const API_FAILURES: ApiFailure[] = [
  { name: '500 server error',          status: 500 },
  { name: '404 not found',             status: 404 },
  { name: '401 unauthorized',          status: 401 },
  { name: '403 forbidden',             status: 403 },
  { name: 'empty array',               status: 200, body: '[]' },
  { name: 'malformed JSON',            status: 200, body: '{ not : valid json ' },
  { name: 'backend unavailable',       abort: true },
  { name: 'timeout (no response)',     delayMs: 32_000, status: 200, body: '[]' },
];

export default { EDGE_INPUTS, SECURITY_PAYLOADS, API_FAILURES };
