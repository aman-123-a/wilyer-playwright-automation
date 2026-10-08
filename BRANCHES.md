# Environments and branches

> **Changed in 2.0.** Environments used to be pinned per branch — you checked out
> `cms3` to test cms3. That is no longer how it works. The target is now chosen at
> run time with `TEST_ENV`, so any branch can run against any server.

## Choosing a target

```bash
npm run cms     # Pre-Production 1  — https://cms.pocsample.in
npm run cms2    # Pre-Production 2  — https://cms2.pocsample.in
npm run cms3    # Pre-Production 3  — https://cms3.pocsample.in
npm run cms4    # Pre-Production 4  — https://cms4.pocsample.in
npm run live    # Production        — https://cms.wilyersignage.com
```

The registry of targets lives in `config/environments.ts`, in version control, so a
change of URL is reviewable in a diff.

| Name   | Environment      | Writes                | Login                |
| ------ | ---------------- | --------------------- | -------------------- |
| `cms`  | Pre-Production 1 | allowed with the flag | local `.env`         |
| `cms2` | Pre-Production 2 | allowed with the flag | local `.env`         |
| `cms3` | Pre-Production 3 | allowed with the flag | local `.env`         |
| `cms4` | Pre-Production 4 | allowed with the flag | local `.env`         |
| `live` | Production       | **hard-blocked**      | supplied at run time |

Writes need `CMS_ALLOW_DESTRUCTIVE=true`. On `live` that flag is ignored — production
is read-only in `config/env.ts` itself, so a misconfigured variable cannot mutate
customer data.

## Branches

Branches are now for work, not for environments:

- `main` — shared code. Feature branches merge here.
- `cms`, `cms2`, `cms3`, `live` — legacy per-environment branches, retained only for
  history. Do not add new work to them; they are superseded by `TEST_ENV`.

## Credentials

Never committed. Put them in a local, gitignored `.env` (copy `.env.example`). For
per-environment logins use `.env.cms2`, `.env.cms3` and so on — those load ahead of
`.env` and are gitignored too.

```
# .env
CMS_ADMIN_EMAIL=...
CMS_ADMIN_PASSWORD=...
```

See [docs/setup.md](docs/setup.md).
