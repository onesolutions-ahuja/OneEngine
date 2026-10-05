# OneEngine metadata-driven code boundaries

This document defines the cleanup target for OneEngine.

## Permanent rule

Business behaviour belongs in metadata. Runtime code provides generic capabilities only.

A page or visual component may define presentation, component properties, responsive layout, navigation context and metadata bindings. It must not embed workflow IDs, registered action IDs, business calculations, database operations, or direct executable action URLs.

## Runtime path

```
metadata page/component
        |
        v
generic event/action runtime
        |
        +--> workflow metadata
        +--> object CRUD runtime
        +--> navigation metadata
        +--> connector runtime
```

The UI should not know which Flow currently implements an operation. Flow activation/replacement is metadata.

## Source structure

- `src/components/` — reusable visual/rendering components.
- `src/pages/` — thin page hosts while legacy pages are being migrated.
- `src/actions/metadata/` — generic client action dispatch. No business-specific behaviour.
- `src/navigation/` — routing/bootstrap mechanics.
- `src/components/shell/` — workstation shell only.
- `server/routes/` — HTTP boundaries.
- `server/services/` — generic runtimes and technical services.
- package/add-on code — isolated by package and activated through package metadata/registrations.

## Converted boundaries

The following surfaces already use shared metadata execution instead of constructing executable button URLs themselves:

- Custom Page runtime
- Workspace
- Object runtime
- Metadata Settings records
- Till button execution

## Migration rule

When converting a page:

1. Preserve behaviour first.
2. Move executable plumbing to a generic action/runtime module.
3. Move action/Flow selection to metadata.
4. Move fields, columns, buttons, visibility and navigation to metadata.
5. Replace the page with the generic renderer/host where possible.
6. Add the converted surface to the metadata-boundary audit.
7. Run build, unit tests, audits and smoke tests before merge.

Do not merge this cleanup branch into `main` until the full validation gate is green.
