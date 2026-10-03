# Metadata / Flow Purity Audit

Audit baseline: `ffbccf9ecfc772c537784eaf76dcd99d78c9d4d0`

## Architecture rule

OneEngine business behaviour must be expressed by metadata and visible Flow steps.

Generic runtime code may implement technical mechanics such as CRUD execution, formula evaluation, SQL safety, transactions/locking, RBAC enforcement, encryption, HTTP transport, authentication protocols, queues/retries and Flow execution.

A registered action/function is **not** considered metadata-driven merely because a System Workflow wraps it. If the implementation contains business-specific decisions, sequencing, mappings, messages, status changes, object selection or record mutations, that logic must be migrated into visible Flow metadata.

## Immediate dead legacy actions — remove

These appointment-specific actions are no longer required by the installed OneAssistant booking router and must be removed completely from the executable action registry and helper code:

- `APPOINTMENT_SESSION_CONTEXT`
- `PROCESS_APPOINTMENT_DATE_RESPONSE`
- `PROCESS_APPOINTMENT_SLOT_RESPONSE`
- `PROCESS_APPOINTMENT_CONVERSATION`
- `SEND_APPOINTMENT_CONVERSATION_REPLY`
- `FIND_APPOINTMENT_SLOTS`
- `HOLD_APPOINTMENT_SLOT`
- `RELEASE_APPOINTMENT_SLOT`
- `LIST_APPOINTMENT_PAYMENT_PROVIDERS`
- `CREATE_APPOINTMENT_PAYMENT_REQUEST`
- `CALCULATE_APPOINTMENT_PAYMENT`
- `CONFIRM_APPOINTMENT`

Legacy debug scripts/tests that invoke these actions must be deleted or rewritten to exercise the saved visible Flow.

## Still referenced — migrate before removal

These are business-specific wrappers and are not accepted as final core primitives, but current metadata/runtime still references them:

- `SEND_APPOINTMENT_MESSAGE`
- `SEND_APPOINTMENT_CONFIRMATION`
- `CREATE_APPOINTMENT_BOOKING_CASE`
- `ISSUE_APPOINTMENT_BOOKING_LINK`
- `RUN_ASSISTANT_SUBFLOW`
- `COMPLETE_APPOINTMENT_PAYMENT`

They must first be replaced with generic CRUD / relationship / formula / decision / API-connection / subflow primitives, then removed.

## Current OneAssistant visible-flow gaps

The installed booking router declares/uses the following resources without visible Flow nodes that fully populate them:

- `date1`
- `date2`
- `slotChoices`
- `slotCount`
- persisted `state.slots`

The old hidden appointment runtime still contains the code that derives these values. The Flow therefore does not yet pass the visibility test even though its canvas no longer includes the old processor nodes.

## Function registry — presumed migrate unless proven technical

The following current categories are business rules/processes rather than final core functions and must be decomposed into metadata/Flow wherever generic primitives can represent them:

- purchasing / purchase receiving
- supplier payment allocation/execution
- online-order lifecycle transitions
- invoice email/SMS/WhatsApp delivery workflows
- pricing/promotion calculations
- tax calculations
- loyalty calculations
- gift-card issue/top-up/redemption rules
- layaway rules
- customer-credit business rules
- till cash/close calculations
- attendance clock-in/out process
- exchange/refund settlement
- inventory replenishment/valuation/business decisions
- approval routing/assignment/escalation business rules

Provider adapter/authentication/HTTP mechanics may remain technical code; provider-specific business sequencing may not.

## Generic primitives currently accepted in principle

Final list is still subject to review, but the expected core boundary is:

- `GET_RECORDS`
- `CREATE_RECORD`
- `UPDATE_RECORD`
- `DELETE_RECORD`
- generic bulk CRUD
- generic relationship add/remove
- `ASSIGNMENT`
- `FORMULA`
- `CONDITION` / Decision
- `LOOP`
- generic collection filter/sort/transform
- `WAIT` / scheduled continuation
- `RUN_SUBFLOW` where the subflow is recursively visible/audited
- generic `CALL_API` / `HTTP_REQUEST` / connector transport
- generic `PRINT` with template/data/printer supplied by metadata
- generic notifications/messages with channel/connector/recipient/template supplied by metadata
- `STOP` / `CUSTOM_ERROR`
- technical transaction/locking/idempotency primitives where required for safe execution

Business-object names must not be embedded in generic primitive implementations.

## Secure metadata rule

Fields marked `secure=true` are encrypted at rest and may be referenced by Flow only through approved secure API/authentication sinks.

Secure values must never appear in:

- Builder display values
- Debug output
- Flow run history
- audit payloads
- ordinary record fields
- templates/messages
- print output
- generic Flow outputs

API Connection metadata should reference reusable Credential metadata. Authentication type (Bearer, API key, OAuth, Basic, HMAC, etc.) is metadata; the runtime implements only the generic protocol mechanics.

## Deletion rule

Unused business-specific functions/actions are removed completely.

For a still-referenced business wrapper:

1. migrate every active/package/system Flow reference to generic visible primitives;
2. migrate tests/debug scripts;
3. verify package installers/upgrades cannot recreate the legacy action;
4. search the repository and persisted workflow metadata for remaining references;
5. remove the registry entry and implementation;
6. rerun the negative search.

No compatibility alias should remain merely because metadata can recreate a Flow later.
