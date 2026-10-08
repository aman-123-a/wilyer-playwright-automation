# Environments and branches

> **Changed 2026-10-08.** Each server has its own branch again, holding only that
> server's code and tests. This is the **cms4** branch.

| Branch | Environment      | Application                     |
| ------ | ---------------- | ------------------------------- |
| `cms`  | Pre-Production 1 | <https://cms.pocsample.in>      |
| `cms2` | Pre-Production 2 | <https://cms2.pocsample.in>     |
| `cms3` | Pre-Production 3 | <https://cms3.pocsample.in>     |
| `cms4` | Pre-Production 4 | <https://cms4.pocsample.in>     |
| `live` | Production       | <https://cms.wilyersignage.com> |

## On this branch

```bash
npm run cms4    # Pre-Production 4 — runs tests/_core + tests/cms4
```

`config/environments.ts` lists cms4 only, and `tests/` holds `_core/` (modules on
every build) plus `cms4/` (file-conversion (no suite yet)). Work for another server goes on
that server's branch. The old pre-2.0 code of this branch is kept in
`legacy/cms4-branch/`.

Writes need `CMS_ALLOW_DESTRUCTIVE=true`.

## Credentials

Never committed. Put them in a local, gitignored `.env` (copy `.env.example`), or in
`.env.cms4`, which loads ahead of `.env` and is gitignored too.

```
# .env
CMS_ADMIN_EMAIL=...
CMS_ADMIN_PASSWORD=...
```

See [docs/setup.md](docs/setup.md).
