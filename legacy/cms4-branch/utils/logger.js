// Lightweight logger — no external deps. Writes to stdout with timestamps.
// Use via: import { logger } from '../utils/logger.js';

const ts = () => new Date().toISOString().split('T')[1].replace('Z', '');

export const logger = {
  info: (msg)  => console.log(`[${ts()}] INFO  ${msg}`),
  warn: (msg)  => console.warn(`[${ts()}] WARN  ${msg}`),
  error: (msg) => console.error(`[${ts()}] ERROR ${msg}`),
  step: (msg)  => console.log(`[${ts()}] STEP  ▶ ${msg}`),
  pass: (msg)  => console.log(`[${ts()}] PASS  ✔ ${msg}`),
  fail: (msg)  => console.log(`[${ts()}] FAIL  ✘ ${msg}`),
};
