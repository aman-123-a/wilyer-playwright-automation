# Edge Cases

Inputs and states worth reusing across features. Add a row whenever a bug is found
at a boundary — the next suite should start from it.

## Strings

| Case | Value | Expected |
|---|---|---|
| Empty | `""` | Rejected with field error |
| Whitespace only | `"   "` | Rejected |
| Max length | <!-- n chars --> | Accepted |
| Max + 1 | | Rejected |
| Unicode / emoji | `名前 🎬` | Accepted, renders intact |
| Leading/trailing space | `" name "` | Trimmed |
| HTML / script | `<script>alert(1)</script>` | Escaped, not executed |
| SQL-ish | `' OR 1=1 --` | Treated as literal |

## Numbers

| Case | Expected |
|---|---|
| `0` | Rejected where floor is 1 |
| Negative | Rejected |
| Non-integer | Rejected |
| Very large | Rejected or clamped |

> Duration fields: the stepper enforces floor 1, **typed input does not**. Always
> test by typing, not only by clicking the stepper.

## Files

| Case | Expected |
|---|---|
| Unsupported extension | Rejected |
| 0-byte file | Rejected |
| Oversize file | Rejected with size message |
| Long transcode (>30s) | <!-- cms4 cutoff — see findings --> |
| Rotated video | Orientation preserved |
| Non-H.264 source | Re-encoded — watch output size |

## Concurrency / state

- Same record edited in two sessions
- Session expiry mid-flow
- Permission revoked while the user is on the page
