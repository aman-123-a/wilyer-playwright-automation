# Environment branches

Each environment has its own branch. The **base URL is pinned per branch** in
`cms-e2e/config/env.ts`, so checking out a branch automatically targets the right
server. Say the website and I switch to its branch.

| Say this | Branch | Target URL | Writes | Login |
|----------|--------|------------|--------|-------|
| **cms**  | `cms`  | https://cms.pocsample.in   | allowed | via local `.env` |
| **cms2** | `cms2` | https://cms2.pocsample.in  | allowed | via local `.env` |
| **cms3** | `cms3` | https://cms3.pocsample.in  | allowed | via local `.env` |
| **live** | `live` | https://cms.wilyersignage.com | **BLOCKED (read-only)** | provided at runtime |

## Rules

- **Credentials are never committed.** Put them in a local, gitignored
  `cms-e2e/.env` (copy from `cms-e2e/.env.example`). No emails or passwords live
  in the repo.
- **`live` is production.** Destructive/write tests are hard-disabled in
  `env.ts` on that branch (the `CMS_ALLOW_DESTRUCTIVE` flag is ignored), and it
  has no default credentials — real logins must be supplied at run time.
- `main` holds shared code and defaults to the `cms` test server. Feature work
  merges here; the env branches carry only the per-environment config on top.

## Local `.env` (not committed)

```
# cms-e2e/.env
CMS_ADMIN_EMAIL=...
CMS_ADMIN_PASSWORD=...
```
