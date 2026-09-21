c# Test Identities

**No passwords, tokens, or keys in this file.** Credentials come from the local
gitignored `.env` only. This file records *which* identity to use and *why*.

| Alias | Role | Scope | Use for |
|---|---|---|---|
| <!-- admin --> | | Account-wide | Baseline / setup |
| <!-- subuser-fenced --> | | Folder-fenced | Negative access checks |
| <!-- subuser-wide --> | | Account-wide | Positive permission checks |
| <!-- maker --> | | | Campaign approval flow |
| <!-- checker --> | | | Campaign approval flow |

## Where the media actually lives

<!-- which folder each identity can see, and where the assets sit -->

## Notes

- On cms2, maker and checker currently hold identical campaign grants.
- Approval mails follow the role `reportsTo` chain, not per-user flags; the
  parent role receives "Escalation".
