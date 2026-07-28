const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('clickup-config.json', 'utf8'));
const token = config.apiToken;
const listId = '901615652519'; // from the URL: https://app.clickup.com/9016764704/v/l/6-901615652519-1

const bugs = [
  {
    name: '[PS-UI-01] Prayer Schedule: Form fields have no label association (Accessibility)',
    description: [
      '**Module:** Prayer Schedule (`/prayer-schedule`), CMS v3.5.20',
      '**Environment:** testdev - https://cms.pocsample.in - Chromium',
      '**Date Found:** 2026-07-23',
      '**Severity:** Medium - Accessibility',
      '',
      '---',
      '',
      '## Description',
      'The Configure/Add-Plan drawer form fields have **no for/id** label association and inputs have **no aria-label / aria-labelledby**. Affects all drawer fields: Plan name, City, Start date, Calculation method, etc.',
      '',
      '## Impact',
      '- Screen readers cannot announce which field is active - violates **WCAG 1.3.1, 3.3.2, 4.1.2**',
      '- Clicking a label does not focus its control',
      '- Automation: getByLabel(/plan name/i) resolves **nothing**; only placeholder/structural locators work',
      '',
      '## Steps to Reproduce',
      '1. Open Prayer Schedule > Schedules tab',
      '2. Click **Add New Plan** or **Configure**',
      '3. Inspect any label element - no "for" attribute; corresponding input has no id, aria-label, or aria-labelledby',
      '',
      '## Expected',
      'Each label should have a "for" attribute matching its input "id" (or the control should be wrapped inside the label).',
      '',
      '## Fix Suggestion',
      'Associate each label[for="field-id"] with its input[id="field-id"] (or use implicit label wrapping).',
    ].join('\n'),
    priority: 3
  },
  {
    name: '[PS-UI-02] Prayer Schedule: No upper bound on Banner / Pre-Announcement duration',
    description: [
      '**Module:** Prayer Schedule (`/prayer-schedule`), CMS v3.5.20',
      '**Environment:** testdev - https://cms.pocsample.in - Chromium',
      '**Date Found:** 2026-07-23',
      '**Severity:** Medium - Validation Gap',
      '',
      '---',
      '',
      '## Description',
      'Both Banner Duration and Pre-Announcement Duration numeric fields enforce min=1 but have **no max attribute**. Live data shows plan "lal kurti" with **Banner: 350 minutes | Pre-Announcement: 200 minutes** — a ~6-hour on-screen banner, almost certainly unintended.',
      '',
      '## Impact',
      '- A prayer-interrupt banner can be set to hundreds of minutes',
      '- No server-side or client-side cap prevents absurd values from being persisted',
      '- Potential UX disruption for end users watching content',
      '',
      '## Steps to Reproduce',
      '1. Open Prayer Schedule > Schedules tab > Configure any plan',
      '2. Set **Banner Duration** to 9999',
      '3. Save — value is accepted and persisted without any validation error',
      '',
      '## Expected',
      'A sane maximum (e.g. prayer window duration, or a hard cap like 60 min) with a validation error above the threshold.',
      '',
      '## Fix Suggestion',
      'Add max attribute to both duration inputs and/or add a confirmation dialog when value exceeds a defined threshold.',
    ].join('\n'),
    priority: 3
  },
  {
    name: '[PS-UI-03] Prayer Schedule: Add-New-Plan leaves Start/End dates blank (UX inconsistency)',
    description: [
      '**Module:** Prayer Schedule (`/prayer-schedule`), CMS v3.5.20',
      '**Environment:** testdev - https://cms.pocsample.in - Chromium',
      '**Date Found:** 2026-07-23',
      '**Severity:** Low-Medium - UX Inconsistency',
      '',
      '---',
      '',
      '## Description',
      'Opening **Add New Plan** shows blank Start/End date fields (mm/dd/yyyy placeholder), so a first-attempt save always fails with "Start date is required" toast. By contrast, editing an **existing** plan pre-fills Start = today / End = today+7. This creates an inconsistent experience.',
      '',
      '## Impact',
      '- New users are confused — the form looks ready to submit but immediately fails',
      '- Inconsistency between Add and Configure flows increases cognitive load',
      '',
      '## Steps to Reproduce',
      '1. Open Prayer Schedule > Schedules tab',
      '2. Click **Add New Plan** — observe Start/End date fields are blank (mm/dd/yyyy)',
      '3. Fill only Plan Name and City, then click Save',
      '4. Toast fires: "Start date is required" — form stays open',
      '',
      '## Expected',
      'New plan drawer should default Start = today, End = today+7 (matching the Configure/edit flow).',
      '',
      '## Screenshot Evidence',
      'See attached: 02-add-new-plan-blank-dates.png',
      '',
      '## Fix Suggestion',
      'Default Start/End dates to today / today+7 when initialising the Add New Plan form.',
    ].join('\n'),
    priority: 3
  },
  {
    name: '[PS-UI-04] Prayer Schedule: Delete plan unreachable while Configure drawer is open',
    description: [
      '**Module:** Prayer Schedule (`/prayer-schedule`), CMS v3.5.20',
      '**Environment:** testdev - https://cms.pocsample.in - Chromium',
      '**Date Found:** 2026-07-23',
      '**Severity:** Low - UX / Layering',
      '',
      '---',
      '',
      '## Description',
      '"Delete plan" lives in the plan-detail panel. When the **Configure** offcanvas is open it floats over the detail panel and intercepts clicks — the Delete button becomes unreachable. A user who opens Configure intending to delete must close Configure first.',
      '',
      '## Impact',
      '- Unexpected UX dead-end; users cannot delete without closing Configure',
      '- Caused automation click-timeout during initial test run',
      '',
      '## Steps to Reproduce',
      '1. Open Prayer Schedule > Schedules tab > click any plan to expand detail panel',
      '2. Click **Configure** — the offcanvas slides in',
      '3. Attempt to click **Delete plan** button in the detail panel',
      '4. Click is intercepted by the Configure overlay — button is unreachable',
      '',
      '## Expected',
      'Delete should be accessible from within the Configure drawer footer, or the Configure overlay should not obscure the Delete action.',
      '',
      '## Fix Suggestion',
      'Place a Delete plan button in the Configure drawer footer (its natural home), or ensure the detail panel Delete is not obscured by the offcanvas z-index.',
    ].join('\n'),
    priority: 3
  },
  {
    name: '[PS-UI-05] Prayer Schedule: New-plan City select defaults to __custom__ sentinel value',
    description: [
      '**Module:** Prayer Schedule (`/prayer-schedule`), CMS v3.5.20',
      '**Environment:** testdev - https://cms.pocsample.in - Chromium',
      '**Date Found:** 2026-07-23',
      '**Severity:** Low - Cosmetic / UX',
      '',
      '---',
      '',
      '## Description',
      'The City select in the Add New Plan drawer defaults to a non-city sentinel value __custom__ rather than a proper placeholder like "Select a city". The raw sentinel is exposed in the DOM and visible as the default selected option.',
      '',
      '## Impact',
      '- Cosmetically incorrect — "Custom" is displayed instead of a meaningful prompt',
      '- Raw internal sentinel value (__custom__) is exposed in the DOM',
      '- Could confuse users or automation tools that inspect the select value',
      '',
      '## Steps to Reproduce',
      '1. Open Prayer Schedule > Schedules tab',
      '2. Click **Add New Plan**',
      '3. Inspect the City select element — default selected option value is __custom__',
      '',
      '## Expected',
      'A disabled placeholder option such as "Select a city" should be shown by default.',
      '',
      '## Screenshot Evidence',
      'See attached: 02-add-new-plan-blank-dates.png (City field shows "Custom")',
      '',
      '## Fix Suggestion',
      'Replace the __custom__ default with an explicit disabled option: "Select a city".',
    ].join('\n'),
    priority: 3
  }
];

function createTask(bug) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      name: bug.name,
      description: bug.description,
      status: 'backlog',
      priority: bug.priority
    });

    const options = {
      hostname: 'api.clickup.com',
      path: '/api/v2/list/' + listId + '/task',
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.id) {
            resolve({ name: bug.name, id: result.id, url: result.url });
          } else {
            reject(new Error('API error: ' + JSON.stringify(result)));
          }
        } catch (e) {
          reject(new Error('Parse error: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const bug of bugs) {
    try {
      const result = await createTask(bug);
      console.log('CREATED:', result.id, '|', result.url);
      console.log('  Name:', result.name.substring(0, 70));
    } catch (e) {
      console.error('FAILED:', e.message);
    }
  }
  console.log('\nDone.');
}

main();
