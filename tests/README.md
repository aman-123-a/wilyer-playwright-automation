# Test tree layout

Specs are filed by the **server that owns the feature**, because every server runs
the same application code and differs only in which features have been built there.

```
tests/
  global.setup.ts        authenticates once per run — always in scope
  _core/                 modules present on every build
  cms/                   owned by cms.pocsample.in    — prayer-schedule
  cms2/                  owned by cms2.pocsample.in   — campaigns, autologin
  cms3/                  owned by cms3.pocsample.in   — media-sets
  cms4/                  owned by cms4.pocsample.in   — file-conversion
  live/                  production-only checks
```

## A folder is "owned by", not "only runs on"

A feature is built on one server and later released to others. Prayer Schedule was
built on `cms` and has since shipped to production, so its specs stay in `tests/cms/`
and **also execute on a `live` run**.

The directory name does not decide what runs — [`config/features.ts`](../config/features.ts)
does. Each feature records `owner` (which folder holds its specs) and `availableOn`
(every server it exists on). `playwright.config.ts` turns that into a `testIgnore`
list, so each run covers: `_core`, its own folder, and the home folder of anything
rolled out to it.

```bash
npm run cms3     # runs _core + cms3
npm run cms2     # runs _core + cms2 + cms3   (media-sets is on cms2 too)
npm run live     # runs _core + live + cms    (prayer-schedule shipped to live)
```

## Adding work

**A new spec for an existing feature** — put it under that feature's owning folder.

**A new feature** — add an entry to `config/features.ts` with its `owner` and
`availableOn`, then create `tests/<owner>/<feature>/`.

**A feature ships to another server** — add that server to `availableOn` in the same
PR as the release. Nothing moves; the specs simply start running there too.

Within a server folder, keep the existing `<feature>/<test-type>/` convention
(`crud/`, `functional/`, `negative/`, `boundary/`, `api/`, `perf/`, `search/`).
Specs under any `api/` folder are claimed by the headless `api` project and excluded
from the browser projects.

## Relative imports

Specs sit four levels below the repo root (`tests/<server>/<feature>/<type>/x.spec.ts`),
so shared code is imported as `../../../../fixtures/test-fixtures`, `../../../../config/env`,
and so on.
