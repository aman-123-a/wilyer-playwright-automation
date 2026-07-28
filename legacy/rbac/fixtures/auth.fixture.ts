import { test as base, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CREDENTIALS } from '../data/roles.data';

type Fixtures = {
  /** A page that is already logged in as the admin user. */
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(CREDENTIALS.admin.email, CREDENTIALS.admin.password);
    await use(page);
  },
});

export { expect };
