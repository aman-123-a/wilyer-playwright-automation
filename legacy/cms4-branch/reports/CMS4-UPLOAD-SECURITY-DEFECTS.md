# CMS4 Upload/Conversion API — Security Defects

Target: `cms4.pocsample.in` (API `v3-5api4.pocsample.in/v3/cms`)
Tested: 2026-10-06, authenticated as `dev@wilyer.com`
Scope: multipart upload pipeline (`create-multipart-upload` → `sign-part` → S3 PUT →
`complete-multipart-upload` → `finalize`) and the resulting library/conversion records.
All PoCs are non-destructive: no foreign objects were overwritten, no delete calls made.

## BUG-UPLOAD-SEC-01 — CRITICAL: `sign-part` signs an S3 PUT for any key/uploadId, no ownership check

**Endpoint:** `GET /v3/cms/file/uppy/sign-part?uploadId=<any>&key=<any>&partNumber=<n>`

**Repro:**
```
GET /v3/cms/file/uppy/sign-part?uploadId=nonexistent-upload-id
    &key=v3/000000000000000000000000/pwn-<ts>.mp4&partNumber=1
Authorization: Bearer <valid token for dev@wilyer.com>
```
→ `200 OK`, body contains a fully valid, AWS-signed PUT URL for
`signage-v3.s3.ap-south-1.amazonaws.com/v3/000000000000000000000000/pwn-<ts>.mp4`
— a key under a folder/account id that is **not** the caller's own, and an `uploadId`
that was never created by `create-multipart-upload`.

**Impact:** any authenticated user can obtain a presigned PUT for an arbitrary object
key in the shared `signage-v3` bucket, including keys under other tenants' folders.
Completing that PUT (not executed in this test) would let one tenant overwrite another
tenant's media files, or write files into another tenant's library namespace. The server
delegates signing to S3 without first verifying that `uploadId` belongs to the caller and
that `key` is one the caller is entitled to write.

**Fix direction:** persist `uploadId → {ownerId, key}` at `create-multipart-upload` time
and reject `sign-part`/`complete-multipart-upload` calls where the caller's identity
doesn't match the stored owner, or where `key` doesn't match the key recorded for that
`uploadId`.

**Status:** re-confirmed 2026-10-06; originally logged 2026-08-31 ([[cms4-file-conversion-defects]] memory). Still live.

---

## BUG-UPLOAD-SEC-02 — MEDIUM: `finalize` creates a library record without verifying the object exists in S3

**Endpoint:** `POST /v3/cms/file/uppy/finalize`

**Repro:** call `finalize` with a `key` that was never uploaded (no prior
`create-multipart-upload` + S3 PUT for that key) and arbitrary `clientWidth`/
`clientHeight`/`clientDuration`. Server returns `200 "File uploaded successfully"` and
creates a real library document (`fileId 6ac4dd4aba566e7c4385c05f`, `0MB`). The file's
playback URL returns `403` (object does not exist).

**Impact:** library pollution with "ghost" records that break playlists/screens
referencing them when played out; cheap to spam (one POST per ghost record, no
rate limit observed — see BUG-UPLOAD-SEC-05).

**Fix direction:** `finalize` should `HEAD` the S3 object (or check
`complete-multipart-upload` succeeded for that exact key) before writing the DB record.

---

## BUG-UPLOAD-SEC-03 — MEDIUM: No content/magic-byte validation — arbitrary bytes accepted as video

**Endpoint:** full pipeline, `finalize` in particular.

**Repro:** uploaded a plain `<html><script>...</script></html>` payload through the full
multipart flow, declared as `type: video/mp4`, named `xss.mp4`. `complete-multipart-upload`
→ 200, `finalize` → 200 (`"File uploaded — transcoding started"`), real `fileId` issued
(`6ac4e103a2b0eaf43e4c8076`). CloudFront now serves the object back with
`Content-Type: video/mp4` (mitigates direct script execution in-browser, but the content
is not a video).

**Impact:** no server-side validation that uploaded bytes match the declared type before
accepting into the pipeline and queuing conversion work. At minimum this wastes transcode
capacity on garbage input and produces broken library entries; depending on how the CDN
object is later served/embedded elsewhere, declared-type trust is a weak boundary.

**Fix direction:** validate file signature/magic bytes (and ideally run a real probe,
e.g. ffprobe) before `finalize` accepts the object and kicks off transcoding.

---

## BUG-UPLOAD-SEC-04 — MEDIUM: `sign-part` does not validate `partNumber` range

**Endpoint:** `GET /v3/cms/file/uppy/sign-part`

**Repro:** `partNumber=0`, `-1`, `10001`, `99999999` against a real `uploadId`/`key` all
returned `200` with a signed URL. S3's own valid range is 1–10000, so this is likely
caught downstream at `complete-multipart-upload`, but the server performs no input
validation of its own before delegating to AWS.

**Impact:** low on its own; combined with BUG-UPLOAD-SEC-01 it confirms the endpoint is
an unvalidated pass-through signer.

**Fix direction:** validate `partNumber` is an integer in [1, 10000] before signing.

---

## BUG-UPLOAD-SEC-05 — LOW: No rate limiting on multipart session creation

**Endpoint:** `POST /v3/cms/file/uppy/create-multipart-upload`

**Repro:** 25 concurrent calls, all `200`, 0 throttled (`429`), ~1.3s total.

**Impact:** cheap resource-exhaustion vector — unlimited abandoned multipart uploads
accrue incomplete-part storage cost in S3 until a lifecycle rule (if any) expires them,
and support BUG-UPLOAD-SEC-02-style ghost-record spam at scale.

**Fix direction:** per-account rate limit on multipart session creation; S3 bucket
lifecycle rule to abort incomplete multipart uploads after N days if not already present.

---

## Checked, no bug found

- **JWT tampering**: payload-id swap with reused signature, and `alg:none` stripped
  signature — both correctly rejected (signature verification holds).
- **Cross-tenant `folderId` enumeration** on `/file/read` — fabricated/foreign folder ids
  return 0 docs, no data leak observed.
- **Path traversal / injection in filenames** (`../../etc/passwd.mp4`, `<script>`, `con.mp4`,
  `nul.mp4`, 500-char name) — all sanitized into safe keys under the caller's own account
  folder.
- **Unauthenticated requests** to `create-multipart-upload` — correctly `401`.

---

## Outstanding cleanup

Two test records are sitting in the dev library from this testing and were not deleted
(delete calls require explicit confirmation in this environment):
- `6ac4dd4aba566e7c4385c05f` — ghost record, `0MB`, name `1791286608157.mp4`
- `6ac4e103a2b0eaf43e4c8076` — HTML-as-mp4 record, name `xss_...mp4`

Related memory: [[cms4-file-conversion-defects]], [[autologin-credential-leak]].
