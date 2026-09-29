# Phase 4A — Extended Zero-Loss Frontend Migration Audit

Parent phase: **Phase 4 core — COMPLETE**

Status: **IN PROGRESS**

This document is the extended Phase 4A verification/cleanup pass. Phase 4 core UI migration work was already completed; Phase 4A exists to prove zero-loss parity before any old frontend is deleted.

Deletion rule: **If even one label, action, trigger, permission, field, API behaviour, validation rule, workflow path, or user-visible function still exists only in the old frontend, the old frontend section is retained.**

## Current decision

| Area | Delete old frontend now? | Current status / blocker |
|---|---:|---|
| Settings | NO | Full Settings shell is visible again, but the current shell still contains a hard-coded navigation catalogue in `App.jsx`. Metadata Settings exists separately. Phase 4A must reconcile these into a non-blocking metadata-authoritative model before old Settings UI can be removed. |
| Builder | NO | OneBuilder contains Workflow, Approval, Report and Dashboard builder support and registry-backed foundations. Final old-vs-new control/label/API round-trip verification is still required before deletion. |
| Till / POS | NO | Previous `window.print()` blocker is resolved. Receipt printing now executes the metadata record button / canonical backend action. Full old POS line-by-line parity and integrated browser QA are still required. |
| Workspace / Object runtime | NO | Previous capped-column blocker is resolved. Workspace now consumes the runtime workspace endpoint, default list-view metadata, record types, relationships, layouts and buttons. Final record-page/action/related-list/mobile-fallback parity still requires verification. |

## Settings audit gate

Required before deleting old Settings UI:

- Navigation must ultimately be authoritative from Settings-hosted Platform Object/field metadata.
- Labels must come from metadata where configurable.
- Values must use Platform Object APIs or registered protected actions.
- RBAC/FLS must control visibility and editability.
- No duplicate frontend permission catalogue should become authoritative.
- Only Superadmin may remain an explicit application exception.
- Protected operations (user invitation/password reset, JARVES licence enforcement, provider credentials, terminal/hardware tests, device-local server configuration) must retain their specialised protected command path rather than being downgraded to generic CRUD.
- Every old Settings label and behaviour must be mapped before deletion.
- Settings shell/navigation must render immediately; metadata loading must be lazy/local and must not block the whole Settings app.

Current findings:
- `MetadataSettingsPage.jsx` is metadata-backed.
- The live desktop route currently uses `SettingsPage` from `App.jsx` so Users/Roles/Store & Till remain visible and fast.
- `App.jsx` still has a hard-coded `settingsGroups` catalogue. This is the primary current Settings Phase 4A blocker.
- Do not switch back to globally blocking `MetadataSettingsPage`; instead merge metadata authority with the fast existing shell.

## Builder audit gate

Current implementation evidence:
- OneBuilder includes workflow trigger/action registry support.
- Approval builder functionality is present.
- Report builder functionality is present.
- Dashboard builder functionality is present.
- Metadata/platform APIs are used.

Before deletion:
- Verify all record events and registered Platform events can start a workflow.
- Verify every registered workflow action schema renders, edits and saves correctly.
- Verify ordered approval steps, approver types, conditions and approval actions round-trip.
- Verify saved Platform reports reopen without losing fields, filters, grouping, metrics or sorting.
- Verify Dashboard save/edit/preview/sharing/default assignment parity.
- Compare every old Builder control and label.

## Till / POS audit gate

Current Till uses runtime Sale buttons from Platform metadata and company payment methods.

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
- Metadata action buttons
- Canonical receipt print action through the Sale record button/backend path

Resolved Phase 4A blocker:
- `window.print()` is no longer present in the Smart Theme Till.

Deletion is still blocked because:
- every old POS flow still needs line-by-line parity verification before removal;
- payment/offline/hardware behaviour requires final integrated browser QA;
- no old Till/POS file may be removed while any old-only label/action remains.

## Workspace audit gate

Current Workspace now:
- loads object workspace metadata from `/api/platform/runtime/objects/:key/workspace`;
- uses default list-view metadata for columns;
- consumes record types;
- consumes relationships;
- consumes layouts;
- consumes metadata buttons;
- uses the runtime record-page endpoint for selected records.

Resolved Phase 4A blocker:
- the previous local `slice(0, 8)` column cap is gone.

Before deleting the old generic runtime:
- verify active Page Builder record/detail layout renders with full parity;
- verify every metadata button/action routes through the canonical action runtime;
- verify relationships/related lists;
- verify record types;
- verify mobile layout fallback;
- verify page interactions and state preservation.

## Phase 4A deletion procedure

1. Audit one old file/component against the new runtime.
2. Record every label/action/trigger/API behaviour it owns.
3. If any item is old-only, **STOP — do not delete that file**.
4. If parity is complete, remove the old file.
5. Re-scan imports/routes.
6. Build/test.
7. Browser-test the deployed GitHub Pages route.
8. Continue to the next old file.

## Current Phase 4A sequence

1. **Settings parity reconciliation — IN PROGRESS**
   - remove the hard-coded navigation catalogue as authority without reintroducing the slow global metadata load;
   - keep Users/Roles/Store & Till immediately visible when authorised;
   - preserve specialised protected actions.

2. **Builder parity audit — PENDING**
   - workflow;
   - approval;
   - report;
   - dashboard;
   - old label/control/API comparison.

3. **Till/POS parity audit — PENDING**
   - old-vs-new line-by-line audit;
   - payment/offline/hardware browser QA.

4. **Workspace parity audit — PENDING**
   - action runtime;
   - record-page/layout;
   - relationships;
   - mobile fallback;
   - state preservation.

No old frontend file is authorised for deletion yet.
