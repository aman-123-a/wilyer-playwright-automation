/**
 * Lightweight, dependency-free structured logger.
 *
 * Writes human-readable, timestamped lines to stdout and (optionally) attaches
 * the same message to the active Allure step via the test reporter's
 * `console` capture. Levels can be filtered with LOG_LEVEL.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVEL_ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const ts = new Date().toISOString();
  const tag = `[${ts}] [${level.toUpperCase()}] [${scope}]`;
  const line = meta !== undefined ? `${tag} ${message} ${safe(meta)}` : `${tag} ${message}`;
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(line);
}

function safe(meta: unknown): string {
  try {
    return typeof meta === 'string' ? meta : JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

/** Create a namespaced logger for a page object or helper. */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: unknown) => emit('debug', scope, msg, meta),
    info: (msg: string, meta?: unknown) => emit('info', scope, msg, meta),
    warn: (msg: string, meta?: unknown) => emit('warn', scope, msg, meta),
    error: (msg: string, meta?: unknown) => emit('error', scope, msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
