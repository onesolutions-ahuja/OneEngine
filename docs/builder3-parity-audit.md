# Builder 3 parity audit

Initial audit baseline: main fc897577dfbedcb6b4f98e5a42059df91689224a, 3 October 2026.
Rebased and re-audited against main 50caac5d99b23e6455ea021664b7b9d387ced949, then incorporated main 1d300b97b15369e539a286a0618bbb080edb2a12 and reverified after further appointment Debug, product and metadata updates.
Builder 2 and WorkflowAdmin remain unchanged. This audit distinguishes source evidence from rendered verification.

Reference specification:
- https://trailhead.salesforce.com/content/learn/modules/flow-basics/meet-flow-builder
- https://help.salesforce.com/s/articleView?id=platform.flow_build_elements_autolayout_add.htm&language=en_US&type=5
- https://admin.salesforce.com/blog/2024/flow-enhancements-summer-24-be-release-ready

| Area | Current main evidence/root cause | Required change | Verification status |
|---|---|---|---|
| Layout | Builder2Page.css has successive density/readability overrides, 230/210px toolbox and 300/280px properties; Start overlays a second panel | Separate scoped CSS, stable panel geometry, independent scroll, persistent footer | Rendered: separate 48px masthead/toolbar, 280px toolbox, 400px properties; reference inspected. Exact all-state equivalence still open. |
| Type selection | OneBuilder owns chooser; Builder2 defaults record when opened independently | Builder 3 list and chooser before editor, mandatory searchable record object | Rendered chooser and required object selection pass. |
| Typography | Node details down to 8px, palette helper 9px, multiple overrides | Consistent label/body/helper hierarchy | Rendered hierarchy inspected; full text-state comparison still open. |
| Action fields | Properties ACTION uses inputsText textarea despite registry schema properties | Recursive schema controls, required/type validation, resource binding | 124 workflow registry schemas render; schema completeness and every action execution still require review. |
| Runtime | Builder2 saves ACTION and CREATE_RECORDS wrappers with config; server accepts registered keys and top-level inputs | Builder 3 compile adapter to registered execution format; preserve editor definition separately | Compiler tests and existing runtime tests pass. Live tenant regression open. |
| Canvas insertion | add() always appends; every + opens identical selector | Insert at clicked position, preserve connections and history | Rendered middle insertion and undo/redo pass; free-form graph order still open. |
| Resource Manager | Row click clears selected; no edit dialog or search | Search, edit, uniqueness validation and reference-aware names | Rendered creation, search, editing pass; all resource variants need further checks. |
| Resource fields | $record children are taken from already existing resources; metadata fields never fetched | Fetch object field metadata, searchable field hierarchy | Rendered triggering-record field lookup passes; cross-object relationships still open. |
| Keyboard | Global cut/copy/paste intercept typing in inputs | Ignore editable targets; undo/redo, save and panel navigation | Rendered typing/copy and panel Cancel pass; full focus/modal matrix open. |
| Save/activate | Client issues do not gate activation | Validate names, schema fields, references and graph; server remains authority | Draft/version endpoints retained, activation blocked on issues; live lifecycle regression open. |
| Data elements | UI config keys differ from executor contracts (filters/sortField/fieldValues) | Explicit serialization and unsupported-mode validation | Registered serialization tested; condition/collection mutation and field-storage adapters unit-tested; full live variants remain open. |
| Decision/Loop | Linear auto layout displays no actual branch routes | Branch connections and runtime branch mapping | Decision branch rendering/insertion pass; existing decision/loop runtime regression pass. Full graph matrix open. |
| Subflow | Generic input/output textareas | Active-flow picker and declared variable mappings | Structured declared contracts and output assignment added; live subflow test open. |
| Test/debug | Empty inputs, run submits current unsaved draft, rollback checkbox ignored | Structured test inputs and saved-version semantics | Saved-version run/debug and persisted test API wiring added; live CRUD/execution verification open. |
| Email/Brevo | Registry has only recipient/contentMode/templateId/subject/body; driver ignores CC/BCC/attachments | Expand provider schema and delivery mappings, then verify payloads | Rendered structured panel and provider payload unit tests pass; native Brevo templates and delivery open. |
| Resources | Choice-set configuration textarea; formula inputs not represented | Structured editors and executable resource definitions | Structured choice editors, formulas, rich text, choice/stage executors added; all resource dependencies open. |
| Screen | Component controls and runtime need per-component parity checks | Full configuration/runtime verification | Screen definition serialized; component-by-component runtime parity is open. |
| Validation | Duplicate node API names, dangling graph edges and resource types not checked | Element-addressable errors and activation guard | Duplicate names, registry required fields and broken variables tested; broader metadata/type/connection validation open. |
| Responsiveness | Minimum columns overflow narrow widths; modal height constraints inconsistent | Drawer on narrow screens, bounded modal scroll, dock-aware frame | Rendered 1440, 1024, 768, 390 checks pass for tested panels. Full dock/shell verification open. |
| All interactions | Existing visual tests skip without credentials and cover only two nodes | Isolated rendered fixture tests plus live authenticated regression | 11 browser interaction checks plus all 120 action-schema panels, 85 unit tests and production build pass. Authenticated tenant verification open. |

Exact pixel equivalence is not established by documentation alone. Reference screenshots must be visually inspected; authenticated tenant save/activation and delivery require live regression. No percentage or completion claim is warranted until the matrix has evidence.

## Implemented changes and evidence

Builder 3 is a separate navigation item at `/developer/builder3`. Its page, editor, canvas, graph and styles are separate files. Builder2Page, Builder2Page.css, builder2Model and WorkflowAdmin have no diff against the baseline. Legacy-builder flows are excluded from this page; direct attempts to open one are rejected before editing, so their definitions are not converted or overwritten.

The execution definition uses the existing action registry, authorization, metadata checks, rule version APIs and workflow executor. A separate `editorDefinition` preserves editable nodes, resources and branches. Server additions provide missing input schemas and resolve Builder 3 input resource references before runtime validation; existing actions without the Builder 3 marker retain their prior validation and execution path. Brevo adds documented optional payload fields without sending mail during verification.

Verification commands:

- `npm run build` — passes trusted runtime audit, app surface audit and production bundle.
- `npm run test:unit` — 85 passing tests, including existing decision, loop, CRUD, fault and screen runtime coverage.
- `node scripts/verify-builder3.mjs` — 11 rendered interaction checks, 124 workflow-eligible registered action panels, no browser page errors. API responses are fixtures based on the actual registry; this is not a live tenant execution test.
- `git diff --check` and protected-builder source diff — pass.

Reproducible browser evidence is in `docs/builder3-verification/`. The Salesforce reference screenshot was inspected alongside the rendered desktop screenshot. Panel widths, title/toolbar division, node treatment, palette colours, field hierarchy and scroll/footer reachability were compared. This is an inspected visual implementation, not a claim of exact pixel equivalence across every Salesforce state.

## Remaining gaps — not completed functionality

The draft is not ready to be described as full Salesforce parity or merged on that basis:

1. Custom/formula Start and filter logic and formula collection filtering require execution adapters. Activation reports these modes as errors rather than silently evaluating them as AND.
2. Condition-based update/delete, creation from record collections, selected-field/advanced Get Records storage and output mapping adapters now compose existing secured executors. Their composition, projection and tenant/store-scoped update are unit-tested. Full live CRUD regression, missing/read-only fields, collection mutation variants, empty-result semantics and output type checks remain open.
3. Every registry schema renders, but that does not establish that each schema describes every supported connector input. Some metadata fields remain generic identifier/value controls. Connector instances, message templates, records and nested fields need complete metadata selectors. Native Brevo template IDs and UTC scheduled delivery payloads are implemented and unit-tested; live delivery remains unverified.
4. The complete free-form connection/order/fault-path model, branch reconvergence, loop return connectors, drag/drop, element grouping, all keyboard/focus states and all contextual menu combinations have not been verified against Salesforce.
5. Screen components, conditional visibility, input validation, same-screen reactivity, choice resource dependencies, stage progression and navigation need full rendered and runtime verification. The screen editor currently retains controls whose complete runtime correspondence has not been established.
6. Authenticated save/version/activate/deactivate/run/debug/test CRUD, durable waits, scheduled object iteration, real connector delivery and a full regression on existing tenant flows have not been performed. No deployment or live-data mutation was attempted.
7. Exact responsive shell/dock geometry and every significant Salesforce panel state require additional side-by-side checks. API Version and Run Context controls currently store authoring metadata; enforcing Salesforce-equivalent execution semantics has not been established.

These items are deliberately recorded as open. Neither a successful build nor rendered field presence satisfies the master completion standard.

## Main-branch refresh

The newer main includes editable appointment router definitions, extra appointment actions, rollback-safe appointment Debug handlers, synthetic Debug trigger records and deployment regression gates. These commits are included by rebase, not replaced. Reinspection confirms Builder 2 still uses `inputsText` for general action inputs, the resource dialog still has its generic choice-set textarea, and the same generic element configuration remains. Builder 3 preserves newer backend handlers and reruns its registry panel sweep and the appointment regression suite against this baseline.

The action-registry fixture now uses the actual `/platform/action-registry` provider, including its two record-page-only capabilities. `RECORD_SAVE` and `RECORD_DELETE` are declared `workflowSupported: false` in server metadata and excluded from Builder 3. They are not workflow executors and must not appear as selectable workflow actions. The report records these exclusions separately from the 124 workflow actions.

Final protected-builder comparisons use main `1d300b97b15369e539a286a0618bbb080edb2a12`. The later main update adds three rollback-safe appointment actions to Debug execution; that allowlist is retained. The newer metadata refresh and product availability implementation are inherited unchanged.
