# Campaigns V1 with RBAC — Permission, Folder & Traceability Matrices

**Document ID:** CMP-QA-DOC-06

---

## 7. RBAC Permission Matrix

**Legend**
`Y` = allowed · `N` = denied · `O` = own records only · `F` = subject to folder permission
(effective = role ∩ folder, BR-06) · `R` = read-only

### 7.1 Expected matrix (test oracle)

| Role | View | Create | Edit | Delete | Publish | Approve | Reject | Folder Access | API Access |
|------|------|--------|------|--------|---------|---------|--------|---------------|-----------|
| **Super Admin** | Y | Y | Y | Y | Y | Y | Y | Y (all folders, can grant) | Y (full) |
| **Admin** | Y | Y | Y | Y | Y | Y | Y | Y (can grant within scope) | Y (full) |
| **Manager** | Y·F | Y·F | Y·F | Y·F | Y·F | N | N | Y (assign within own scope) | Y (scoped) |
| **Operator** | Y·F | Y·F | Y·F | O·F | N | N | N | R | Y (scoped, no publish) |
| **Publisher** | Y·F | N | N | N | Y·F | N | N | R | Y (read + publish) |
| **Approver** | Y·F | N | N | N | N | Y | Y | R | Y (read + approve/reject) |
| **Viewer** | Y·F | N | N | N | N | N | N | R | Y (read only) |
| **Restricted User** | Y (permitted folders only) | N | N | N | N | N | N | N | Y (heavily scoped) |
| **Unrestricted User** | Y (all folders) | Y | Y | Y | Y | N | N | Y | Y |

### 7.2 Verification requirements per cell

Every `Y` cell must be proven at **two layers**; every `N` cell at **four**:

| Cell | Layer 1 (UI) | Layer 2 (API) | Layer 3 (route) | Layer 4 (data) |
|------|-------------|---------------|-----------------|----------------|
| `Y` | Control visible & functional | Endpoint returns 2xx | — | — |
| `N` | Control hidden or disabled | Endpoint returns 403 | Direct `goto` blocked | No entity data in any response body |

A `N` cell proven only at the UI layer is **not** considered tested (RSK-02). This is the
single most important rule in this document.

### 7.3 Derived RBAC test cases

| Matrix cell | Case | Notes |
|-------------|------|-------|
| Viewer × Create = N | CMP-112, CMP-113 | UI + API |
| Viewer × Delete = N | CMP-118, CMP-119 | UI + API |
| Operator × Publish = N | CMP-121 | Publish gate |
| Publisher × Approve = N | CMP-123 | Segregation of duties |
| Approver × Edit = N | CMP-115, CMP-116 | Read-only approver |
| Manager × Approve = N | CMP-123 | Manager cannot self-approve |
| Restricted User × View (denied folder) | CMP-047, CMP-053, CMP-055 | Folder fencing |
| Restricted User × Folder Access = N | CMP-127 | |
| Any role × cross-tenant | CMP-138 | TagTalk isolation |
| Role ∩ Folder combinations | CMP-132, 133, 134 | BR-06 truth table |

### 7.4 Role ∩ Folder truth table (BR-06)

| Role permission | Folder permission | Effective | Case |
|-----------------|-------------------|-----------|------|
| Allow | Allow | **Allow** | CMP-132 |
| Allow | Deny | **Deny** | CMP-133 |
| Deny | Allow | **Deny** | CMP-134 |
| Deny | Deny | **Deny** | implied |
| Allow | Inherited allow | **Allow** | CMP-049 |
| Allow | Inherited deny | **Deny** | CMP-047 |
| Allow | Explicit child deny under parent allow | **Deny** | CMP-050 |

---

## 8. Folder Permission Test Matrix

Structure used for all folder cases:

```
Root
├── F_PUBLIC          (all roles: read/write)
├── F_RESTRICTED      (Restricted User: denied)
└── F_PARENT          (allowed)
    ├── F_CHILD_INH   (no explicit ACL — inherits F_PARENT)
    └── F_CHILD_DENY  (explicit deny)
        └── F_GRAND   (no explicit ACL — inherits the deny)
```

| # | Folder condition | Action | Expected | Case |
|---|------------------|--------|----------|------|
| FM-01 | Public folder | View campaigns | Visible to all roles with View | CMP-036 |
| FM-02 | Public folder | Create campaign | Allowed with Create | CMP-035 |
| FM-03 | Restricted folder | View | Folder and campaigns hidden entirely | CMP-047 |
| FM-04 | Restricted folder | Direct API fetch of a known campaign id | 403/404 | CMP-055 |
| FM-05 | Restricted folder | Appears in picker | Must not appear | CMP-053 |
| FM-06 | Restricted folder | Appears in search | Must not appear | CMP-054 |
| FM-07 | Nested — depth 2 | Full CRUD | Works identically to depth 1 | CMP-045 |
| FM-08 | Nested — depth 5 | Full CRUD | Works; breadcrumb correct | CMP-046 |
| FM-09 | Parent restriction | Access child campaign | Denied (inheritance) | CMP-047 |
| FM-10 | Parent allowed, child denied | Access child | Denied (explicit override) | CMP-050 |
| FM-11 | Parent allowed, child denied | Access grandchild | Denied (deny inherited down) | CMP-EDGE-075 |
| FM-12 | Parent denied, child explicitly allowed | Access child | Documented precedence, matching Media behaviour | CMP-EDGE-076 |
| FM-13 | Move campaign — source allowed, target allowed | Move | Succeeds | CMP-038 |
| FM-14 | Move campaign — target denied | Move | Blocked in UI and API | CMP-039 |
| FM-15 | Move campaign — source denied | Move | Not offered; API 403 | CMP-039 |
| FM-16 | Move into a restricted folder | Effect on other users | They lose visibility | CMP-056 |
| FM-17 | Copy campaign to an allowed folder | Copy | Independent copy, order preserved | CMP-040, 041 |
| FM-18 | Copy to a denied folder | Copy | Blocked | CMP-039 |
| FM-19 | Rename a folder holding campaigns | Rename | Campaigns intact; references unaffected | CMP-042 |
| FM-20 | Rename to a duplicate folder name | Rename | Rejected per folder rules | Media parity |
| FM-21 | Delete a folder with unused campaigns | Delete | Same behaviour as a folder of media | CMP-043 |
| FM-22 | Delete a folder with an in-use campaign | Delete | Blocked or safely cascaded (BR-08) | CMP-044 |
| FM-23 | Delete a folder without Delete permission | Delete | Blocked | CMP-060 |
| FM-24 | Restructure — move F_CHILD under F_RESTRICTED | Access | Recomputed from the new ancestry | CMP-062 |
| FM-25 | Grant access at runtime | Visibility | Appears without re-login | CMP-052 |
| FM-26 | Revoke access at runtime | Visibility | Disappears without re-login | CMP-051 |
| FM-27 | Folder count badge | Count | Excludes campaigns the user cannot see | CMP-EDGE-079 |
| FM-28 | Folder filter dropdown | Listing | Restricted folder names not disclosed | CMP-EDGE-078 |

**Parity requirement (PB-RULE-04):** every row above must be executed twice — once with a
**media file** and once with a **campaign** — and the outcomes compared. Divergence is a defect
even if the campaign behaviour is independently reasonable.

---

## 21. Traceability Matrix

### 21.1 Requirement → Test cases

| Requirement | Description | Test cases | Coverage |
|-------------|-------------|-----------|----------|
| FR-CMP-01 | Create campaign, unique name | CMP-001, 006–019, 028, CMP-N-001…003, 010–013 | Full |
| FR-CMP-02 | Add ordered items | CMP-001, 002, 030–033, 024, CMP-N-004…006, 020–026 | Full |
| FR-CMP-03 | Reorder items | CMP-021, CMP-EDGE-040, 085 | Full |
| FR-CMP-04 | Remove item | CMP-022, 023 | Full |
| FR-CMP-05 | Edit metadata & durations | CMP-020, 034, 075, 161 | Full |
| FR-CMP-06 | Delete campaign | CMP-026, 027, 029, 218, CMP-EDGE-019…025 | Full |
| FR-CMP-07 | Duplicate campaign | CMP-025 | Partial |
| FR-CMP-08 | Search / filter / sort | CMP-203…212 | Full |
| FR-CMP-09 | Pagination | CMP-213, CMP-EDGE-105 | Full |
| FR-CMP-10 | Item count bounds | CMP-002, 004, 005, CMP-EDGE-001…006 | Full |
| FR-FLD-01 | Shared folder tree | CMP-035, 036, 057 | Full |
| FR-FLD-02 | Folder restrictions | CMP-047, 053, 054, 055, FM-03…06 | Full |
| FR-FLD-03 | Inheritance | CMP-048, 049, 050, 062, CMP-EDGE-074…076 | Full |
| FR-FLD-04 | Move | CMP-038, 039, 056, FM-13…16 | Full |
| FR-FLD-05 | Copy | CMP-040, 041, FM-17, 18 | Full |
| FR-FLD-06 | Folder rename/delete | CMP-042, 043, 044, FM-19…23 | Full |
| FR-FLD-07 | No visibility without access | CMP-047, 061, CMP-EDGE-078…081 | Full |
| FR-PL-01 | Campaigns picker tab | CMP-063 | Full |
| FR-PL-02 | Insert into playlist | CMP-064…067, 076, 078 | Full |
| FR-PL-03 | Remove from playlist | CMP-068 | Full |
| FR-PL-04 | Multiple campaigns | CMP-071, 072, 149…152 | Full |
| FR-PL-05 | Same campaign twice | CMP-070, CMP-EDGE-048 | Full |
| FR-PL-06 | Campaign across playlists | CMP-073, 084, 087, CMP-EDGE-047 | Full |
| FR-PL-07 | Duration calculation | CMP-074 | Partial |
| FR-PL-08 | Picker respects permissions | CMP-053, 082 | Full |
| FR-CL-01 | Cluster assignment | CMP-089…091, 102 | Full |
| FR-CL-02 | Cluster sync | CMP-092, 098 | Full |
| FR-CL-03 | Sync failure / retry / rollback | CMP-095, 096, 097, 182 | Full |
| FR-CL-04 | Offline screens | CMP-093, 094, CMP-EDGE-045 | Full |
| FR-RBAC-01 | 8-permission set | CMP-105, 106, 126, 127 | Full |
| FR-RBAC-02 | Independent grant/revoke | CMP-107…125, 139, 140 | Full |
| FR-RBAC-03 | Server-side enforcement | CMP-110, 113, 116, 119, 121, CMP-N-040…048 | Full |
| FR-RBAC-04 | Role ∩ folder | CMP-129, 132, 133, 134, §7.4 | Full |
| FR-RBAC-05 | Change without re-login | CMP-051, 052, 135, CMP-EDGE-069…071 | Full |
| FR-RBAC-06 | Segregation of duties | CMP-131, 173, CMP-N-043 | Full |
| FR-RBAC-07 | Hidden or disabled controls | CMP-108, 112, 115, 118, 128 | Full |
| FR-APR-01 | Approval flow entry | CMP-024, 167 | Full |
| FR-APR-02 | Approve → publish | CMP-122, 170 | Full |
| FR-APR-03 | Reject | CMP-124, 171, 172 | Full |
| FR-APR-04 | Pending visibility | CMP-168, 169 | Full |
| FR-APR-05 | Approval audit | CMP-186, 216 | Full |
| FR-EML-01 | Email on change | CMP-187, 188, 202 | Full |
| FR-EML-02 | Body structure | CMP-189, 191, 194, 195, 197 | Full |
| FR-EML-03 | Campaign name | CMP-192 | Full |
| FR-EML-04 | Source labelling | CMP-193 | Full |
| FR-EML-05 | Count accuracy | CMP-190 | Full |
| FR-EML-06 | Rendering | CMP-196, 198, 199 | Partial |
| FR-EML-07 | Retry / no duplicates | CMP-200, 201, CMP-EDGE-089 | Full |
| FR-AUD-01 | Actions logged | CMP-214, 216, 186 | Full |
| FR-AUD-02 | Delta, actor, time | CMP-215, 219, CMP-EDGE-067 | Full |
| FR-AUD-03 | Immutable, permissioned | SC-AUD-010 | Partial |
| PB-RULE-01 | Single-campaign loop | CMP-141…148 | Full |
| PB-RULE-02 | Independent counters, LCM | CMP-149…152, CMP-EDGE-049…052 | Full |
| PB-RULE-03 | Multi-layout timeline | CMP-153, 155, 156 | Full |
| PB-RULE-03a | Layout repeats LCM times | CMP-154, 157, CMP-EDGE-053, 054 | Full |
| PB-RULE-04 | Media parity | CMP-037, 091, 209, FM-all | Full |

### 21.2 Risk → Test cases

| Risk | Mitigating cases |
|------|-----------------|
| RSK-01 off-by-one loop resolution | CMP-142, 148, 159, 160, CMP-EDGE-035…037 |
| RSK-02 UI-only RBAC | CMP-110, 113, 116, 119, 121, 136, §7.2 |
| RSK-03 inheritance not applied to campaigns | CMP-047…050, 062, FM-09…12, CMP-EDGE-074…076 |
| RSK-04 deleted media crashes player | CMP-EDGE-019…021, CMP-N-024 |
| RSK-05 email count from payload not DB | CMP-190 |
| RSK-06 approval bypass | CMP-121, CMP-N-042, 044 |
| RSK-07 silent last-write-wins | CMP-185, CMP-N-060, CMP-EDGE-083, 084, 088 |
| RSK-08 picker performance | CMP-081, CMP-EDGE-105, SC-PERF-004 |
| RSK-09 counter reset on sync | CMP-164, CMP-EDGE-044 |
| RSK-10 shared counter desync | CMP-158, 165, CMP-EDGE-046…048 |
| RSK-11 soft-deleted still resolvable | CMP-220, CMP-EDGE-025 |
| RSK-12 duplicate emails | CMP-200, CMP-EDGE-089, 090 |

### 21.3 Coverage gaps (declared, not hidden)

| Requirement | Gap | Reason | Action |
|-------------|-----|--------|--------|
| FR-CMP-07 | Duplicate/clone partially covered | Feature presence unconfirmed on cms2 | Confirm, then extend |
| FR-PL-07 | Duration-calculation basis undefined | No product rule stated | **Blocking question for Product** |
| FR-EML-06 | Email client matrix limited | No client-farm access | Manual spot-check on 3 clients |
| FR-AUD-03 | Immutability unverifiable from the UI | Needs DB/API access (DEP-11) | Defer to an infra-assisted pass |
| Section 14 (DB) | Partially automatable | Depends on DEP-11 | Mark cases Manual until access granted |
| PB-RULE-03a | Derived, not stated | Inferred from the timeline table | **Blocking question for Product** |

---

**Next:** [07-api-security-performance.md](07-api-security-performance.md)
