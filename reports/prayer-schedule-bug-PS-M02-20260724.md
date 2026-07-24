# Bug Report — PS-M02: "Choose Media" search is not debounced — every keystroke fires a media-service request

| | |
|---|---|
| **ID** | PS-M02 |
| **Title** | The media picker `Search...` box issues **one `file/read` request per character typed** — no debounce — flooding the media service and exposing the grid to out-of-order responses |
| **Module** | Prayer Schedule → Schedules → per-prayer **FILES** column → **Choose Media** picker, CMS **v3.5.20** |
| **Environment** | **testdev** · `https://cms.pocsample.in` · Chromium · admin `dev@wilyer.com` |
| **API** | `GET https://v3-5api.pocsample.in/v3/cms/file/read?limit=50&search=<term>&…&folderId=<id>` |
| **Date** | 2026-07-24 |
| **Severity** | **Medium** — performance / scalability defect; also a correctness risk via response races |
| **Priority** | Medium |
| **Status** | Open — **reproduced** 2026-07-24 (fails on retry, not flaky) |
| **Reported by** | Aman Kumar (QA) |

---

## Description

The `Search...` input in the **Choose Media** picker fires a request on **every
keystroke**, with no debounce (or an interval short enough to be ineffective at
realistic typing speed).

Typing the 5-character term `salad` at a **120 ms** inter-key delay — slower than
normal typing — produced **5 separate requests**:

```
GET /v3/cms/file/read?…&search=s      &folderId=6a28f134…
GET /v3/cms/file/read?…&search=sa     &folderId=6a28f134…
GET /v3/cms/file/read?…&search=sal    &folderId=6a28f134…
GET /v3/cms/file/read?…&search=sala   &folderId=6a28f134…
GET /v3/cms/file/read?…&search=salad  &folderId=6a28f134…
```

A separate `folder/read?…&search=<term>` call is issued alongside, so the real
request count per typed word is higher still. An earlier capture of the 6-character
term `wonderland` showed the same 1:1 keystroke-to-request pattern.

---

## Steps to reproduce

1. Log in to `https://cms.pocsample.in` as `dev@wilyer.com`.
2. **Prayer Schedule → Schedules**, select plan **t1**.
3. On the **Fajr** row click **`+ Files`** to open **Choose Media**.
4. Open DevTools → **Network**, filter `file/read`.
5. Type `salad` into the **`Search...`** box at a normal pace.

**Expected:** the input is debounced (~250–400 ms idle) so a typed word collapses into
**~1 request**.

**Actual:** **5 requests** — one per character. Every keystroke reaches the media
service.

---

## Impact

- **Load amplification.** Each search costs ~N× more requests than necessary, where N
  is the term length. `file/read` is a paged, sorted query over the media library —
  not a cheap endpoint. Multiply by every operator using the picker.
- **Response race → wrong grid contents.** With no debounce and no request
  cancellation/sequencing, a slower earlier response (`search=sal`) can land **after**
  a later one (`search=salad`) and repaint the grid with results for a prefix the user
  has already moved past. The user then sees results that do not match the box
  contents. This is latency-dependent and will surface on slow links well before it
  does on a fast office connection.
- **Wasted mobile/branch bandwidth** for deployments driving signage from constrained
  networks.

---

## Recommended fix

1. **Debounce the input ~300 ms** on idle rather than per keystroke.
2. **Cancel superseded requests** (`AbortController`) or discard stale responses by
   sequence number, so the grid can only ever render the newest term. Debouncing alone
   reduces the race window but does not eliminate it.
3. Consider a **minimum term length** (e.g. 2 chars) — the single-character `search=s`
   query scans nearly the whole library for no useful result.

---

## Notes

- The same picker also has a functional scoping defect — see **PS-M01** (folder search
  returns files from outside the open folder). PS-M01 is the higher-priority of the
  two; this one is load/robustness.
- A prayer caps at two media files; once full the `[+ Files]` button is not rendered.
  Use Fajr / Dhuhr / Asr on plan `t1` to reproduce.

---

## Automated coverage

```
cms-e2e/tests/prayer-schedule/prayer-media-picker.spec.ts
  › "search input is debounced @api @regression"
```

The test types 5 characters and asserts `≤ 2` `file/read` calls (a debounced input
yields 1; the allowance absorbs one trailing call). It currently fails with:

```
typing 5 characters issued 5 file/read requests — search is not debounced
Expected: <= 2
Received:    5
```

Run:

```bash
cd cms-e2e
npx playwright test prayer-media-picker --project=chromium --workers=2
```
