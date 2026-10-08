# Environment / Host Mapping

Source of truth: `config/environments.ts`. Selected with `TEST_ENV` (or the matching
npm script). Branch-per-environment is superseded — do not pick an env by checking
out a branch.

| Env | Script | UI base | API base | Confidence |
|---|---|---|---|---|
| cms | `npm run cms` | `https://cms.pocsample.in` | `https://v3-5api.pocsample.in/v3/cms` | **verified** |
| cms2 | `npm run cms2` | `https://cms2.pocsample.in` | `https://v3-5api2.pocsample.in/v3/cms` | **verified** (2026-07-28, campaigns suite) |
| cms3 | `npm run cms3` | `https://cms3.pocsample.in` | `https://v3-5api3.pocsample.in/v3/cms` | _convention_ — reachable, origin unproven |
| cms4 | `npm run cms4` | `https://cms4.pocsample.in` | `https://v3-5api4.pocsample.in/v3/cms` | _convention_ — reachable, origin unproven |
| live | `npm run live` | `https://cms.wilyersignage.com` | `https://v3-5api.wilyersignage.com/v3/cms` | **verified** (2026-08-04, captured CMS traffic) |

## Confidence levels

`apiConfidence` in `config/environments.ts` is not decoration. `convention` means the
host was inferred from the `cmsN → v3-5apiN` pattern and **never confirmed to be that
environment's backend** — reachability alone does not count (see the cms3/cms4 note
below). Global setup prints a loud warning before any run against an inferred host, so
a 404 there may be a bad host guess rather than a product defect. Override with
`CMS_API_BASE_URL` until someone confirms it.

To close a gap: confirm the real host, then set `apiConfidence: 'verified'` in
`config/environments.ts` with a dated note, and update `docs/known-gaps.md` §1.

## cms3 / cms4 — probed 2026-09-16

An earlier note claimed cms3 was confirmed and promoted to `verified`. It was not —
the repo never had that. Re-probed from scratch:

- Both hostnames **resolve and are served by the real API application**. `POST
  /v3/cms/auth/login` returns the app's own JSON errors (Joi `"email" must be a valid
  email`, then `Recaptcha verification failed`) — not the SPA's HTML shell. They are
  not dead names.
- **But the origin is unproven.** `v3-5api2`, `v3-5api3` and `v3-5api4` sit on the
  same Cloudflare IPs and returned byte-identical responses, so nothing observable
  from outside shows that each hostname reaches its own environment's backend.
- **reCAPTCHA on `/auth/login` blocks the check that would settle it.** This is the
  same constraint that makes `helpers/rbac/identities.ts` drive login through the UI
  instead of the API.

Net: cms3 and cms4 are "reachable and API-shaped", **not** verified. To close it,
authenticate once against each and confirm the response carries that environment's
data, then promote `apiConfidence` in `config/environments.ts` with a dated note and
update `docs/known-gaps.md` §1.

## Trap

The **CMS host is SPA-only** and returns fake `200`s for API-looking paths. Always
point API assertions at the API base above, never at the UI base, or every negative
test passes for the wrong reason.

## cms4 coverage

`tests/cms4/` holds a README and no specs yet — file conversion is in development on
cms4 with no automated suite authored. See `config/features.ts`.

## Devices

| Device | Address | Notes |
|---|---|---|
| W2 player box | 192.168.1.69 | Two player packages installed; the **newer-numbered** one is the stale build |
