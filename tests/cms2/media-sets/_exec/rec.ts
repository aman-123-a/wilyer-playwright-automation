// =============================================================================
//  Execution recorder for the Media Sets test-case run (docs/qa-reports/media-sets).
//  Each case is run inside `run(id, fn)`: a returned string is the PASS evidence,
//  a thrown Verdict records an explicit status, any other error is a FAIL. One
//  JSON line per case lands in reports/cms2/exec/extended.jsonl, which the report
//  builder merges with the automated suite's results.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

export type Status = 'Pass' | 'Fail' | 'Observed' | 'Blocked' | 'Not Run';

const OUT = path.resolve(process.env.REC_OUT ?? 'reports/cms2/exec/extended.jsonl');

export class Verdict extends Error {
  constructor(
    readonly status: Status,
    message: string,
  ) {
    super(message);
  }
}

export const fail = (msg: string): never => {
  throw new Verdict('Fail', msg);
};
export const observed = (msg: string): never => {
  throw new Verdict('Observed', msg);
};
export const blocked = (msg: string): never => {
  throw new Verdict('Blocked', msg);
};

function append(line: object): void {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.appendFileSync(OUT, JSON.stringify(line) + '\n');
}

const clip = (s: string, n = 400): string => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** Run one case, never throw: the verdict is the record. */
export async function run(id: string, fn: () => Promise<string | void>): Promise<void> {
  const started = Date.now();
  try {
    const evidence = (await fn()) ?? '';
    append({ id, status: 'Pass', evidence: clip(evidence), ms: Date.now() - started });
  } catch (e) {
    if (e instanceof Verdict) {
      append({ id, status: e.status, evidence: clip(e.message), ms: Date.now() - started });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      append({ id, status: 'Fail', evidence: clip(msg), ms: Date.now() - started });
    }
  }
}

/** Record a verdict decided outside `run` (e.g. carried from an earlier observation). */
export function record(id: string, status: Status, evidence: string): void {
  append({ id, status, evidence: clip(evidence), ms: 0 });
}
