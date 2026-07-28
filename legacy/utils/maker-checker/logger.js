// Tiny prefixed logger — keeps test output grep-friendly in CI
const stamp = () => new Date().toISOString();

export const logger = {
  info:  (msg) => console.log(`[INFO ] ${stamp()} ${msg}`),
  warn:  (msg) => console.warn(`[WARN ] ${stamp()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${stamp()} ${msg}`),
  step:  (msg) => console.log(`[STEP ] ${stamp()} ▶ ${msg}`),
};
