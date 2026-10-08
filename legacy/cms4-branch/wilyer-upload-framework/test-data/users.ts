/**
 * User test-data. Credentials themselves come from env (never hard-coded);
 * this module re-exports them in a test-friendly shape and adds derived data.
 */
import { env, type UserCredentials } from '../config/env.js';

export const Users: Record<'maker' | 'checker' | 'restricted', UserCredentials> = {
  maker: env.users.maker,
  checker: env.users.checker,
  restricted: env.users.restricted,
};

/** A set of clearly-invalid credentials for negative login tests. */
export const InvalidCredentials = {
  wrongPassword: { email: env.users.maker.email, password: 'definitely-wrong-pw' },
  unknownUser: { email: `no-such-user-${Date.now()}@example.com`, password: 'whatever' },
  emptyEmail: { email: '', password: '12345' },
  emptyPassword: { email: env.users.maker.email, password: '' },
  malformedEmail: { email: 'not-an-email', password: '12345' },
} as const;
