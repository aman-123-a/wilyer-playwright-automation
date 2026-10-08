# AUTOLOGIN-SEC-01 — `readPublic` serves recorded credentials in plaintext, unauthenticated

**Severity:** Critical
**Status:** Open — *authoritative status is the ClickUp ticket*
**Ticket:** <!-- ClickUp link -->
**Env:** non-production · **Found:** <!-- YYYY-MM-DD -->

## Summary

The Auto Login `readPublic` endpoint returns recorded login credentials in
plaintext to an unauthenticated caller. Anyone who can reach the host can read
stored credentials for any recorded site.

## Steps to reproduce

1. Record a credential set through the Auto Login extension.
2. Call the `readPublic` endpoint with no authentication header.
3. Read the response body.

## Expected

Unauthenticated callers are rejected. Credentials are never returned in plaintext
to any caller.

## Actual

Response contains the stored credentials in plaintext, HTTP 200, no auth required.

## Evidence

<!-- Request + redacted response. Do NOT paste real credentials. -->

## Impact

Full credential disclosure for every recorded site on the affected host.

## Scope note

Production is **not** affected: there is no `readPublic` leak there — `byHost` and
`withKeys` are authed, and credential CRUD is extension-only. Confirm this before
downgrading severity for a prod release.

## Regression test

<!-- spec file + test name asserting 401/403 on unauthenticated readPublic -->
