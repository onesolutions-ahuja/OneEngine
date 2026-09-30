# Platform Metadata Promotion

Use the read-only exporter to produce package-manifest metadata from a source company. It does not read business records, update metadata, or install a package.

```powershell
npm run platform:metadata:export -- <company-id> <object-key> [object-key ...]
```

`DATABASE_URL` must point to the source database. The JSON output separates the portable `manifest` fragment from `sourceCompanyId` and `warnings`. Copy the supported manifest arrays into the target package definition in `services/packageRegistry.js`, review them, and increment that package's version before publishing/installing through the existing package lifecycle.

The exporter includes objects, fields, relationships, layouts/forms, list views, validation rules, and reports. It converts reusable picklist value sets into field-local options. It reports active workflows and record types/approval processes as warnings because their current package contracts can contain tenant-specific IDs or are not provisioned by the package installer. Resolve those dependencies explicitly before promoting the package; do not copy source-company IDs into a package manifest.

The source metadata remains unchanged. The standard `provisionPackageMetadata` ownership and user-modification protections remain authoritative when the promoted package is installed.