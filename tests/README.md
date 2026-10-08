# Test tree layout

Specs are filed by the **server that owns the feature**.

```
tests/
  global.setup.ts        authenticates once per run — always in scope
  _core/                 modules present on every build
  cms2/                  owned by cms2.pocsample.in   — campaigns, notifications, media-sets
```

This is the cms2 branch. Other servers' specs live on their own branches
(`cms`, `cms3`, `cms4`, `live`). `npm run cms2` runs `_core` + `cms2`.

## Adding work

**A new spec for an existing feature** — put it under that feature's owning folder.

**A new feature** — add an entry to `config/features.ts` with `owner: 'cms2'`, then
create `tests/cms2/<feature>/`.

Within a server folder, keep the existing `<feature>/<test-type>/` convention
(`crud/`, `functional/`, `negative/`, `boundary/`, `api/`, `perf/`, `search/`).
Specs under any `api/` folder are claimed by the headless `api` project and excluded
from the browser projects.

## Relative imports

Specs sit four levels below the repo root (`tests/<server>/<feature>/<type>/x.spec.ts`),
so shared code is imported as `../../../../fixtures/test-fixtures`, `../../../../config/env`,
and so on.
