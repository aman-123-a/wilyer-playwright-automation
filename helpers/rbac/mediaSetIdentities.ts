// Media Sets suite identities — resolved from the gitignored .env only.
import type { Credentials } from '../../config/env';

export type MsRole = 'maker' | 'checker';

const VARS: Record<MsRole, { email: string; password: string }> = {
  maker: { email: 'MS_MAKER_EMAIL', password: 'MS_MAKER_PASSWORD' },
  checker: { email: 'MS_CHECKER_EMAIL', password: 'MS_CHECKER_PASSWORD' },
};

export function msCredentials(role: MsRole): Credentials | undefined {
  const email = process.env[VARS[role].email];
  const password = process.env[VARS[role].password];
  return email && password ? { email, password } : undefined;
}
