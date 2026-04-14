import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Agent } from '../utils/Agent.js';

// Load test data at module scope
const users = JSON.parse(
  readFileSync(new URL('../data/users.json', import.meta.url), 'utf-8')
);

const BASE_URL = 'https://cms.pocsample.in/';

// Selector bank — keep in one place so tests stay readable.
const SEL = {
  emailInput:    { role: 'textbox', name: /email|phone/i },
  passwordInput: { role: 'textbox', name: /password/i },
  loginButton:   { role: 'button',  name: /log in/i },
};

test.describe('Login flow (agent-style)', () => {
  test.setTimeout(60_000);

  let agent;

  test.beforeEach(async ({ page }) => {
    agent = new Agent(page, { retries: 2, timeout: 15_000 });
    await agent.goto(BASE_URL);
    await agent.expectVisible(SEL.emailInput);
  });

  test('Positive: valid credentials reach the dashboard', async ({ page }) => {
    await agent.fill(SEL.emailInput,    users.valid.email);
    await agent.fill(SEL.passwordInput, users.valid.password);
    await agent.click(SEL.loginButton);

    // Proof of auth: login form is no longer on screen.
    await expect(page.getByRole('button', { name: /log in/i })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('textbox', { name: /password/i })).toHaveCount(0);
  });

  test('Negative: invalid credentials keep user on login screen', async ({ page }) => {
    await agent.fill(SEL.emailInput,    users.invalid.email);
    await agent.fill(SEL.passwordInput, users.invalid.password);
    await agent.click(SEL.loginButton);

    // Still on login — login button should remain visible.
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible({ timeout: 10_000 });
  });
});
