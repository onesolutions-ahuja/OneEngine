# Phase 4A — Extended Zero-Loss Frontend Migration Audit

Parent phase: **Phase 4 core — COMPLETE**

Status: **COMPLETE — AUDIT CLOSED**

Completion meaning: the extended zero-loss comparison is finished and every deletion gate has a recorded decision. **Phase 4A completion does not mean the old frontend was deleted.** The zero-loss rule requires old code to remain wherever parity is not proven.

Deletion rule: **If even one label, action, trigger, permission, field, API behaviour, validation rule, workflow path, or user-visible function still exists only in the old frontend, the old frontend section is retained.**

## Final Phase 4A decision

| Area | Delete old frontend now? | Final Phase 4A finding |
|---|---:|---|
| Settings | NO | Metadata Settings now has a bounded, cache-backed catalogue path and protected registered actions, but the live fast Settings shell in `App.jsx` still uses the legacy hard-coded `settingsGroups` navigation. Keep old Settings code until the live shell consumes the metadata catalogue as its navigation authority without reintroducing whole-page loading. |
| Builder | NO | OneBuilder is registry-backed for workflow actions/triggers, reports and dashboard components, and supports approval configuration. Final parity is not proven for the old approval-request queue / admin surface, workflow-runs administration, and dashboard sharing/default-assignment controls. Keep the old Builder surfaces. |
| Till / POS | NO | Core functional parity has materially advanced and the old `window.print()` blocker is gone. Receipt printing uses the registered Sale record action. Connectivity, scanner, modifiers, stock warnings, durable offline cash queue, retries/statistics, age verification, online-order notices, customer display and receipt-QR policy are present. Final integrated browser/device/payment/printer QA is still required before deletion. |
| Workspace / Object runtime | NO | The previous local eight-column cap is gone. Workspace consumes runtime list views, record types, relationships, layouts, record-page metadata and registered buttons, including related-record loading and canonical action execution. Mobile-layout fallback and cross-navigation state preservation still require runtime verification before the older generic runtime can be deleted. |

## Settings — final audit

### Verified migrated foundations

- Metadata Settings objects are discovered from the Platform settings catalogue.
- The metadata catalogue now uses the bounded backend endpoint:
  - `/api/platform/runtime/settings-catalog`
- The catalogue is cached in-session so opening Settings does not need to rebuild the full metadata graph before showing the shell.
- Effective object permissions are returned with catalogue entries.
- Sectioned settings use field metadata such as `settingsSection`.
- Generic Settings objects use Platform Object records/fields.
- Registered system buttons/actions are surfaced by the metadata Settings runtime.
- Device-scoped Server/API configuration uses the device metadata path.
- Users and Roles remain protected by their specialised account/security operations in the legacy fast shell.

### Deletion blocker

The live desktop route currently uses the fast `SettingsPage` shell in `App.jsx`, and that shell still contains the hard-coded `settingsGroups` catalogue.

Therefore:
- **do not delete the old Settings implementation;**
- do not switch back to the former slow whole-page metadata loading behaviour;
- the next migration step must make the live shell consume the bounded metadata catalogue for labels/order/visibility while keeping specialised protected actions for Users/Roles/device/provider operations.

This is now a recorded migration item, not an unresolved audit question.

## Builder — final audit

### Verified migrated foundations

OneBuilder consumes:
- workflow trigger registry;
- workflow action registry and action schemas;
- object metadata / fields;
- approval roles and approval-process APIs;
- report-builder registry;
- Platform reports;
- dashboard component registry;
- dashboard APIs.

It supports:
- record/event workflow trigger selection;
- registered workflow action editing;
- schema-driven workflow properties;
- approval entry criteria;
- approval steps;
- approval options such as record locking, reassignment and rejection comments;
- submission / approval / rejection action configuration;
- report fields, filters, groups, metrics and sorting;
- dashboard component composition.

### Deletion blockers found

The Smart Theme OneBuilder does not currently prove complete parity for every old administration surface. In particular, source inspection does not show equivalent coverage for:
- the old pending approval-request queue/admin surface;
- the old Workflow Runs administration surface;
- the full old Dashboard sharing/default-assignment administration surface.

Therefore the old Builder/admin files remain protected by the zero-loss rule.

## Till / POS — final audit

### Verified migrated foundations

Smart Theme Till includes:
- metadata-driven Sale buttons;
- company payment methods;
- Hold / Resume;
- Customer selection;
- Discount;
- Void/cart clear;
- Misc Item;
- Petty cash;
- Till session / cash movement;
- Cash;
- Card / One Connect;
- additional payment methods;
- split tender;
- customer credit;
- gift card;
- price override;
- receipt QR lifecycle/policy;
- authoritative connectivity monitoring;
- durable offline cash queue;
- manual retry controls;
- offline sync statistics;
- customer display bill mirror;
- age-verification gate;
- stock warnings / negative-stock handling;
- product modifiers and modifier cache;
- barcode scanner behaviour;
- online-order notices;
- sale-complete/change notice.

### Resolved blocker

`window.print()` is no longer present in the Smart Theme Till receipt path.

Receipt printing now executes the registered Sale record button/backend action:
- `/api/platform/objects/sale/records/:recordId/buttons/:buttonKey/execute`

### Remaining deletion gate

Final integrated browser/device QA is still required for payment terminals, printers, offline recovery and real hardware behaviour. Old Till/POS source remains until that QA is signed off.

## Workspace / Object runtime — final audit

### Verified migrated foundations

Workspace now:
- loads object runtime metadata from `/api/platform/runtime/objects/:key/workspace`;
- uses default list-view metadata;
- has no local `slice(0, 8)` list-column cap;
- consumes record types;
- consumes relationships;
- consumes layouts and default create/detail layouts;
- fetches selected records through the runtime record-page endpoint;
- renders active layout fields;
- surfaces registered metadata buttons;
- executes buttons through the canonical record-action endpoint;
- loads related records through the canonical relationship endpoint;
- respects effective object permissions for create/edit/delete.

### Remaining deletion gate

Source parity is substantially present, but Phase 4A cannot authorise deletion without runtime verification of:
- mobile-specific layout selection/fallback;
- preservation of list/filter/selection state across navigation;
- full browser behaviour of every configured record-page interaction.

The old generic runtime remains.

## Phase 4A zero-loss result

The audit is complete.

### Files authorised for deletion
**None.**

### Why
Each major area still has at least one unproven parity/runtime item. Under the user's zero-loss rule, that is sufficient to retain the corresponding old frontend.

### Work completed during Phase 4A

- Workspace runtime metadata parity advanced substantially.
- Workspace local column cap removed.
- Workspace relationships, record types, layouts and actions wired.
- Server/API settings bound to device metadata.
- Registered system actions rendered in metadata Settings.
- Till receipt print moved to registered backend action.
- Till scanner, modifiers, stock handling, connectivity and durable offline behaviour migrated.
- Till queue retries/statistics and receipt/customer-display policies completed.
- Metadata Settings loading changed from the previous broad client-side N+1 discovery pattern to the bounded `settings-catalog` endpoint with session caching.

## Handoff after Phase 4A

Phase 4A itself is **COMPLETE**.

The remaining items are implementation/QA work, not missing audit work:

1. Make the live fast Settings shell use the metadata Settings catalogue as navigation authority and remove the remaining hard-coded `settingsGroups` authority only after label/action parity is preserved.
2. Close Builder admin-surface gaps before deleting old Builder files.
3. Complete live printer/payment/offline device QA before deleting old Till/POS files.
4. Complete Workspace mobile-layout/state-preservation runtime QA before deleting the old generic runtime.

Until those gates close, the zero-loss rule remains: **do not delete the protected old frontend files.**
