# Phase 4 — Zero-Loss Frontend Migration Audit

Status: **IN PROGRESS**

Deletion rule: **If even one label, action, trigger, permission, field, API behaviour, validation rule, workflow path, or user-visible function still exists only in the old frontend, the old frontend section is retained.**

## Current decision

| Area | Delete old frontend now? | Current blocker |
|---|---:|---|
| Settings | NO | Protected/specialised commands still need complete metadata-action parity and final old-vs-new label/API audit. |
| Builder | NO | Functional parity still needs final verification across Workflow, Approval, Report and Dashboard builders. |
| Till / POS | NO | Receipt printing still contains browser-print fallback; final old POS parity audit remains; specialised sale flows must be verified one-by-one. |
| Workspace / Object runtime | NO | List rendering still derives columns locally (including a capped field slice) instead of consuming the full active list/layout metadata runtime. |

## Settings audit gate

Required before deleting old Settings UI:

- Navigation must come from Settings-hosted Platform Object/field metadata.
- Labels must come from metadata.
- Values must use Platform Object APIs or registered protected actions.
- RBAC/FLS must control visibility and editability.
- No frontend permission catalogue.
- Only Superadmin may remain an explicit application exception.
- Protected operations (user invitation/password reset, JARVES licence enforcement, provider credentials, terminal/hardware tests, device-local server configuration) must retain their specialised protected command path rather than being downgraded to generic CRUD.
- Every old Settings label and behaviour must be mapped before deletion.

Current new Settings host already uses:
- `settingsHost`
- `settingsSectionSource`
- Platform Object records/fields
- effective permissions
- Superadmin exception

Deletion remains blocked until the protected-action and label audit is complete.

## Builder audit gate

The new OneBuilder now consumes:
- workflow trigger registry
- workflow action registry
- approval roles/process APIs
- report-builder registry
- Platform reports
- dashboard APIs/component registry

Before deletion:
- Verify all record events and registered Platform events can start a workflow.
- Verify every registered workflow action schema renders/edit/saves correctly.
- Verify ordered approval steps, approver types, conditions and approval actions round-trip.
- Verify saved Platform reports reopen without losing fields, filters, grouping, metrics or sorting.
- Verify Dashboard save/edit/preview/sharing/default assignment parity.
- Compare every old Builder control and label.

## Till / POS audit gate

The new Till already consumes runtime Sale buttons from Platform metadata and company payment methods.

Migrated foundations include:
- Hold / Resume
- Customer selection
- Discount
- Void/cart clear
- Misc item
- Petty cash
- Till session / cash movement
- Cash
- Card / One Connect
- Other payment methods
- Split tender
- Customer credit
- Gift card
- Price override
- Receipt QR lifecycle
- Offline cash queue
- Customer display bill mirror
- Age-verification gate

Deletion is still blocked because:
- receipt printing still contains `window.print()` fallback and must be reconciled with the canonical printer/hardware path;
- every old POS flow still needs line-by-line parity verification before removal;
- payment and offline behaviour require final integrated browser QA.

## Workspace audit gate

Workspace is metadata-backed for object discovery and records, but it must not create a second presentation policy.

Current blocker found:
- local list-column derivation still contains a capped field slice rather than relying entirely on active list/page/layout metadata.

Before deleting the old generic runtime:
- list columns must come from active list/layout metadata;
- active Page Builder record/detail layout must render directly;
- metadata buttons/actions must be surfaced through the canonical action runtime;
- relationships/related lists, record types, mobile layout fallback and page interactions must be verified.

## Deletion procedure

1. Audit one old file/component against the new runtime.
2. Record every label/action/trigger/API behaviour it owns.
3. If any item is old-only, **STOP — do not delete that file**.
4. If parity is complete, remove the old file.
5. Re-scan imports/routes.
6. Build/test.
7. Continue to the next old file.

No old frontend file is authorised for deletion yet.
