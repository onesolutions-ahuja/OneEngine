# SFDC-Style Capability Matrix

Audit scope: onePOS platform Phase 3 review, 2026-09-27. COMPLETE means runtime/API/admin/security/test evidence exists in this repository. PARTIAL names the remaining gap.

| Capability | Status | Exact remaining gap if PARTIAL |
|---|---|---|
| Objects | COMPLETE | |
| Fields | COMPLETE | |
| Relationships | COMPLETE | |
| Record Types | COMPLETE | |
| Forms | COMPLETE | |
| Page Layouts | COMPLETE | |
| Dynamic Forms / Conditional UI | COMPLETE | |
| Validation Rules | COMPLETE | |
| Formula Fields | COMPLETE | |
| Roll-Up / Aggregate Fields | COMPLETE | |
| Field-Level Security | COMPLETE | |
| Permission Sets | COMPLETE | |
| Roles / Role Hierarchy | COMPLETE | |
| Sharing Rules | COMPLETE | |
| Queues / Public Groups | COMPLETE | |
| Assignment Rules | COMPLETE | |
| Global Search | COMPLETE | |
| Matching / Duplicate Rules | COMPLETE | |
| Generic Record Delete | COMPLETE | |
| Generic Metadata CSV Import / Export | COMPLETE | |
| Notifications / Event Subscription | COMPLETE | |
| Approval Builder | COMPLETE | |
| Flow Builder / Orchestration | COMPLETE | |
| Scheduled Flow | COMPLETE | |
| Wait / Retry / Error Handling | COMPLETE | |
| Human Work Items | COMPLETE | |
| Flow Trace / Debug | COMPLETE | |
| Message Templates | COMPLETE | |
| Custom Report Builder | COMPLETE | |
| Components / Component Registry | COMPLETE | |
| Metadata Deployment / Promotion | COMPLETE | |
| Deployment Dry Run / Conflict Detection | COMPLETE | |
| Deployment History / Rollback | COMPLETE WITH NON_REVERSIBLE EXCEPTION | Package metadata provisioning is marked NON_REVERSIBLE because shared package-owned metadata must remain intact; installation state is restored safely. |
| Audit Log UI | COMPLETE | |
| Package / App metadata integration | COMPLETE WITH NON_REVERSIBLE EXCEPTION | Deployment reuses the canonical package metadata provisioner and installation table; package-owned metadata is explicitly non-reversible. |
| Security / tenant isolation | COMPLETE | |
| Mobile-specific metadata-driven page support | COMPLETE | |
| Generic Data Loader where already implemented/planned | COMPLETE | |

Phase 3 implementation adds portable package validation, dependency ordering, dry-run planning, conflict reporting, deployment history records, permission-gated deployment APIs, canonical package installer reuse, typed rollback handlers, and audit events for export, dry run, success, failure, and rollback. Package-owned metadata is explicitly surfaced as NON_REVERSIBLE while installation state remains reversible.
