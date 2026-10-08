# Test tree layout

Specs are filed by the **server that owns the feature**.

```
tests/
  global.setup.ts        authenticates once per run — always in scope
  _core/                 modules present on every build
  cms4/                  owned by cms4.pocsample.in   — file-conversion (no suite yet)
```

This is the cms4 branch. Other servers' specs live on their own branches
(cms, cms2, cms3, cms4, live). `npm run cms4` runs `_core` + `cms4`.

## Adding work

**A new spec for an existing feature** — put it under that feature's owning folder.

**A new feature** — add an entry to `config/features.ts` with `owner: 'cms4'`, then
create `tests/cms4/<feature>/`.

Within a server folder, keep the existing `<feature>/<test-type>/` convention
(`crud/`, `functional/`, `negative/`, `boundary/`, `api/`, `perf/`, `search/`).
Specs under any `api/` folder are claimed by the headless `api` project and excluded
from the browser projects.

## Relative imports

Specs sit four levels below the repo root (`tests/<server>/<feature>/<type>/x.spec.ts`),
so shared code is imported as `../../../../fixtures/test-fixtures`, `../../../../config/env`,
and so on.
