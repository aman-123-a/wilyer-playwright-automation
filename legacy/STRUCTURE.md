# Repository Structure

> Navigation map for the `wilyer-playwright` test repo. This is **not one Playwright
> project** — it's a root suite plus several self-contained sub-frameworks, all pointing
> at the same one or two CMS targets (`cms.pocsample.in`, `cms.wilyersignage.com`).
> The same concepts (login, library, playlists) are re-implemented in parallel folders,
> which is why the code-graph reports low cohesion.

## 1. Two structural layers

### Layer A — root suite (the original project)

```
tests/      specs run by the root configs
pages/      Page Objects (LoginPage.js, GroupsPage.js, PlaylistsPage.js,
            ScreensPage.ts, cms/, maker-checker/)
utils/      testData.js, logger.js, Agent.js, cms/, maker-checker/
helpers/    loginHelper.js
fixtures/   cms-fixtures.js + cms-media (test upload files)
data/       users.json, hierarchy-users.json, *.xlsx, sample files
scripts/    session capture, report builders, md->pdf
```

### Layer B — self-contained sub-frameworks

Each has its own `package.json` + Playwright config (+ its own `node_modules`):

```
cms-e2e/                    TS framework, baseURL=ENV
rbac/                       role / permission tests
signage-cms-automation/     smoke + regression (src/tests/)
adaptive-content-framework/
wilyer-upload-framework/    maker / checker / email / api / edge / negative split
```

In-repo but not separate npm packages (own configs):

```
wilyer-signage-suite/   feature-folder tests, own config
search-suite/           own config
cms-ts/                 TS specs variant
```

## 2. Config -> testDir -> target (the entry points)

| Config / npm script                            | Runs                          | Target            |
| ---------------------------------------------- | ----------------------------- | ----------------- |
| `playwright.config.js` / `.ts`, `npm test`     | `./tests`                     | cms.pocsample.in  |
| `playwright.cms.config.js`, `npm run cms`      | `./tests/cms-suite` (16)      | ENV               |
| `playwright.maker-checker.config.js`           | `./tests/maker-checker` (6)   | cms.pocsample.in  |
| `playwright.wilyer-dashboard.config.ts`        | `./wilyer-dashboard/tests`    | cms.pocsample.in  |
| `npm run ws*`                                  | `wilyer-signage-suite/tests`  | ENV               |
| `cms-e2e/playwright.config.ts`                 | `cms-e2e/tests`               | ENV               |
| `rbac/` config                                 | `rbac/tests`                  | cms.pocsample.in  |
| `search-suite/` config                         | `search-suite/tests`          | ENV               |

## 3. Where the specs live (non-vendor)

- **`tests/` = 27 specs** + `tests/cms-suite/` (16) + `tests/maker-checker/` (6)
  -> the largest code-graph cluster
- `cms-ts/specs/` (6), `signage-cms-automation/` (6), `rbac/` (4),
  `wilyer-signage-suite/` (~18 across feature folders), `cms-e2e/` (~11),
  `search-suite/` (1)

## 4. Structural friction (navigation notes, not action items)

- **`pages/` is split across multiple graph clusters** — Page Objects are duplicated
  between root `pages/`, `cms-e2e/pages/`, `wilyer-signage-suite/`, etc.
  Same screen, several POMs.
- **Mixed JS/TS** — the root is `.js`; the newer frameworks are `.ts`.
- **Five root configs** decide which folder runs; `npm test` is not what most suites
  need. Run the cms-suite via `npm run cms`, not `npm test`.

## 5. Rule of thumb

To find a test, start from the **config's `testDir`**, not the folder name — several
folders named `tests/` exist, and only the matching config runs each.
