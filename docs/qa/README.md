# QA Documentation

Human-written QA docs only. Anything generated or tracked elsewhere does not live here.

| Folder | Holds | Does NOT hold |
|---|---|---|
| `01_strategy/` | Test approach, scope, entry/exit criteria, release gate | Per-feature detail |
| `02_features/` | One file per feature: flows, acceptance criteria, case list, known defects | Copies of the BRD/PRD — link them |
| `03_testdata/` | Identities, host mapping, edge cases | Credentials (those live in gitignored `.env`) |
| `04_findings/` | Defects needing deep repro, one file per ID | Routine bugs — those live in ClickUp |
| `05_releases/` | One file per release: what ran, what failed, signoff | Generated Playwright reports |

## Rules

1. **Test cases live as code**, organised by feature and tagged by type:
   `test('...', { tag: ['@smoke', '@rbac', '@negative'] })`.
   `02_features/<feature>.md` lists what is covered and links to the spec file.
2. **Bug status lives in ClickUp**, not in folder names. `04_findings/` is only for
   defects whose repro is too long for a ticket; the ticket links here.
3. **Reports are generated**, not written. Playwright HTML output stays gitignored.
4. **No credentials, ever.** See the repo's no-credentials rule.
5. A folder is justified only if someone opens it during a sprint. If one goes
   untouched for two releases, delete it.
