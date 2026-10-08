# Release Checklist

Gate for signoff. Every line is pass/fail — no "mostly".

## Pre-execution

- [ ] Target env and build version confirmed
- [ ] Test identities valid and permissions seeded
- [ ] Test data reset / known state

## Execution

- [ ] `@smoke` green
- [ ] `@regression` green, or each failure linked to a ticket
- [ ] `@rbac` green for every role under test
- [ ] `@api` contract checks green
- [ ] Player / device suite run (if the release touches playback)

## Defects

- [ ] No open Critical
- [ ] No open High without written risk acceptance
- [ ] Reopened defects from last release verified

## Signoff

- [ ] Release file written in `../05_releases/`
- [ ] Known issues listed and communicated
- [ ] QA signoff recorded — name, date, build
