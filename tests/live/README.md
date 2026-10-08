# tests/live — production (cms.wilyersignage.com)

For checks that only make sense against production. Everything released to live is
already covered by `_core` plus the owning folder of each released feature, so this
folder stays small by design.

**Read-only, always.** `config/env.ts` forces `ALLOW_DESTRUCTIVE` off on this
environment regardless of the flag, so a destructive spec placed here will skip
rather than mutate customer data — but do not author one in the first place.

Run with `npm run live`, and prefer `npm run live -- --grep @smoke` for routine
post-deploy checks. See [../README.md](../README.md) for how folder ownership and
rollout work.
