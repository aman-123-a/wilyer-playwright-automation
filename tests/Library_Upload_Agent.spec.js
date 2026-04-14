import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Agent } from '../utils/Agent.js';

// Refactor of Library_Upload.spec.js using the Agent wrapper.
// The original file is kept intact for comparison.

const users = JSON.parse(
  readFileSync(new URL('../data/users.json', import.meta.url), 'utf-8')
);

const BASE_URL    = 'https://cms.pocsample.in/';
const SAMPLE_FILE = path.resolve('data/sample.jpg');
const SAMPLE_NAME = path.basename(SAMPLE_FILE);

// Central selector bank.
const SEL = {
  emailInput:    { role: 'textbox', name: /email|phone/i },
  passwordInput: { role: 'textbox', name: /password/i },
  loginButton:   { role: 'button',  name: /log in/i },
  libraryLink:   { role: 'link',    name: /library/i },
  uploadFilesBtn:{ role: 'button',  name: /upload files?/i },
  browseFilesBtn:{ role: 'button',  name: /browse files?/i },
};

// Reusable login step — any spec can import this pattern.
async function login(agent, page) {
  await agent.goto(BASE_URL);
  await agent.fill(SEL.emailInput,    users.valid.email);
  await agent.fill(SEL.passwordInput, users.valid.password);
  await agent.click(SEL.loginButton);
  // Proof of auth: login button is gone.
  await expect(page.getByRole('button', { name: /log in/i }))
    .toBeHidden({ timeout: 20_000 });
}

test.describe('Library — File Upload (agent-style)', () => {
  test.setTimeout(120_000);

  test('Upload a file to Library and verify it appears', async ({ page }) => {
    const agent = new Agent(page, { retries: 2, timeout: 20_000 });

    // 1. Login
    await login(agent, page);

    // 2. Navigate to Library
    await agent.click(SEL.libraryLink);
    await agent.expectVisible(SEL.uploadFilesBtn);

    // 3. Open upload dialog
    await agent.click(SEL.uploadFilesBtn);

    // 4. Browse + set file. File chooser is a Playwright-native event,
    //    so we pair it with a raw click rather than agent.click().
    //    Per project memory: setFiles auto-starts upload — no confirm step.
    const browseBtn = page.getByRole('button', { name: /browse files?/i });
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      browseBtn.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_FILE);

    // 5. Dialog close = upload finished
    await agent.expectHidden(SEL.browseFilesBtn);

    // 6. Verify file appears in library list (match on base name, app may prefix)
    const baseName = SAMPLE_NAME.replace(/\.[^.]+$/, '');
    await expect(
      page.getByText(new RegExp(baseName, 'i')).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
