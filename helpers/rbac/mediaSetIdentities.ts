// Media Sets suite identities — resolved from the gitignored .env only.
import type { Credentials } from '../../config/env';

export type MsRole = 'maker' | 'checker' | 'bulkMaker';

const VARS: Record<MsRole, { email: string; password: string }> = {
  maker: { email: 'MS_MAKER_EMAIL', password: 'MS_MAKER_PASSWORD' },
  checker: { email: 'MS_CHECKER_EMAIL', password: 'MS_CHECKER_PASSWORD' },
  // A maker who can see at least one screen and is the only member of its role —
  // the Bulk Publish permission spec toggles that role.
  bulkMaker: { email: 'MS_BULK_MAKER_EMAIL', password: 'MS_BULK_MAKER_PASSWORD' },
};

export function msCredentials(role: MsRole): Credentials | undefined {
  const email = process.env[VARS[role].email];
  const password = process.env[VARS[role].password];
  return email && password ? { email, password } : undefined;
}
