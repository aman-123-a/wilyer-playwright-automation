
# Bug Report — PS-M01: "Choose Media" folder search returns files from outside the open folder, letting a prayer be assigned media the operator never navigated to

| | |
|---|---|
| **ID** | PS-M01 |
| **Title** | Media picker search is **not scoped to the open folder** — searching inside a nested folder returns files that live elsewhere in the library, despite the request correctly sending `folderId` |
| **Module** | Prayer Schedule → Schedules → per-prayer **FILES** column → **Choose Media** picker, CMS **v3.5.20** |
| **Environment** | **testdev** · `https://cms.pocsample.in` · Chromium · admin `<admin — see local .env>` |
| **API** | `GET https://v3-5api.pocsample.in/v3/cms/file/read?limit=50&search=<term>&page=1&type=&sort=createdAt&order=-1&folderId=<id>` |
| **Date** | 2026-07-24 |
| **Severity** | **High** — breaks the folder isolation the picker's own UI promises; an operator can assign media to a live prayer-interrupt plan from a folder they never opened |
| **Priority** | High |
| **Status** | Open — **reproduced** 2026-07-24 (fails on retry, not flaky) |
| **Reported by** | Aman Kumar (QA) |

---

## Description

The **Choose Media** picker (opened from the `[+ Files]` button on any prayer row)
lets the operator drill into nested folders. Once inside a folder, the grid correctly
shows only that folder's contents — but **typing in the `Search...` box returns files
from outside the folder**.

The client behaves correctly: it *does* send the current folder in the request.

```
GET /v3/cms/file/read?limit=50&search=wonderland&page=1&type=&sort=createdAt
    &order=-1&folderId=6a28f1343fddae24ab078865      ← Noida's id, correctly sent
```

The **service ignores `folderId` when `search` is non-empty** and answers from the
whole library instead.

### Verified folder tree

The fixture subtree was enumerated exhaustively before filing, so the expected result
is not in doubt:

```
BenQ/
  └── Noida/                      1 file   → wonderland_1782105034092.jpg
        └── Botanical Garden/     2 files  (Screenshot_13_05_2026….png, code_….png — no "wonderland")
              ├── test/          29 files  (no "wonderland")
              └── test2/          0 files
```

The **entire `Noida` subtree contains exactly ONE** file matching `wonderland`.

### Actual result

Searching `wonderland` while inside `BenQ/Noida` returns **six** files — five of which
are not in the folder, nor in any of its descendants:

```
+ wonderland_1783512719114.jpg    ← outside the folder
+ wonderland_1783512664131.jpg    ← outside the folder
+ wonderland_1783512425392.jpg    ← outside the folder
+ wonderland_1783512097761.jpg    ← outside the folder
+ wonderland_1783511326101.jpg    ← outside the folder
  wonderland_1782105034092.jpg    ← the only genuine member of this folder
```

For reference, the same search at the **library root** returns 7 results — so the
in-folder search is returning almost the entire global match set.

---

## Steps to reproduce

1. Log in to `https://cms.pocsample.in` as `<admin — see local .env>`.
2. Go to **Prayer Schedule → Schedules**; select plan **t1** (or any plan whose prayer
   rows still show a `[+ Files]` button — see *Notes*).
3. On the **Fajr** row, click **`+ Files`** → the **Choose Media** modal opens.
4. Click folder **`BenQ`**, then **`Noida`**.
   Observe the grid shows exactly **one** file: `wonderland_1782105034092.jpg`.
5. Type **`wonderland`** into the **`Search...`** box.

**Expected:** 1 result — `wonderland_1782105034092.jpg` (the only match in this folder
and its subtree). Search should stay within the folder the operator drilled into.

**Actual:** **6 results.** Five files that do not exist anywhere under `BenQ/Noida`
are listed and are **selectable** — they can be assigned to the prayer.

---

## Inconsistency worth investigating

This is **not** a clean "`folderId` is always ignored", and that detail should go to
whoever picks this up:

- Searching **`sample`** inside the same `BenQ/Noida` folder correctly returns
  **0 results** and the "This folder is empty." state — even though `sample_*.mp4`
  files definitely exist at the library root.
- Searching **`wonderland`** in that same folder leaks 5 outside files.

So the scoping is applied in some cases and not others. The backend team should
explain the discrepancy rather than assume a blanket fix; a naive "always apply
`folderId`" patch may not address the actual root cause.

---

## Impact

- **Folder isolation is a lie.** The picker's whole navigation model tells the operator
  "you are inside `BenQ/Noida`". Search silently breaks that contract.
- **Wrong media on live signage.** Prayer Schedule plans interrupt screen content at
  prayer times. Assigning a file the operator never navigated to — one that may belong
  to a different customer folder, brand, or location — publishes it to real screens.
- **Folder structure offers no safety.** Teams organise media by
  location/brand/customer (`BenQ`, `India 1 DND`, `Maker/Checker Flow`). If search
  ignores that structure, the organisation provides no protection against mis-selection.

---

## Notes

- A prayer **caps at two media files** — once two are assigned the `[+ Files]` button
  is **not rendered at all**. On plan `t1`, Maghrib and Isha are already full, so use
  Fajr / Dhuhr / Asr to reproduce.
- The folder-listing call (`/v3/cms/folder/read?parentFolder=<id>`) **is** correctly
  scoped; only `file/read` misbehaves.
- Same defect surface is reachable from any module that embeds this picker — worth
  checking whether Library, Playlists and Media Sets share the component.

---

## Automated coverage

Encoded as a failing regression test (deliberately asserts **correct** behaviour so the
bug cannot be silently normalised):

```
cms-e2e/tests/prayer-schedule/prayer-media-picker.spec.ts
  › "search stays scoped to the folder subtree @regression"
```

Run:

```bash
cd cms-e2e
npx playwright test prayer-media-picker --project=chromium --workers=2
```

The test guards itself with `test.skip()` if the `BenQ/Noida` fixture tree is
reorganised, so it will not produce false failures once staging data changes.
