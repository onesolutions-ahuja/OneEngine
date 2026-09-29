# Old UI → Smart Theme Migration Matrix

Zero-loss rule: an old UI page/section is deleted only after its Smart Theme replacement has equivalent routes, data, permissions, actions, fields, validation and user-visible behaviour. If business logic is uncertain, mark HOLD and move on.

## Phase 1 — Settings

| Old UI page / section | Smart Theme replacement | Logic fully migrated? | Old UI deleted? | Status / note |
|---|---|---:|---:|---|
| General | Yes | Yes | Yes | Date format, currency, timezone, Scan & Go, exchange mode, batch inventory policy migrated. Batch settings retrieval fixed. |
| Company | Yes | Yes | Yes | Company identity/contact, currency/timezone, compressed logo upload/remove, licence summary migrated. |
| Tax / VAT | Yes | Yes | Yes | VAT enabled + validated 0–100% default rate migrated. Currency remains available under General/Company. |
| Receipts | Yes | Yes | Yes | Company header, VAT display/rate, date format and Hardware paper-width guidance migrated. |
| Store & Till | Yes | Pending audit | No | Next |
| Client Web Shop | Navigation only / pending | No | No | Pending |
| Payment Terminals | Navigation only / pending | No | No | Pending |
| Customer Loyalty | Partial | No | No | Pending full comparison |
| Hardware | Navigation only / pending | No | No | Pending |
| Users | Yes | Pending full comparison | No | Pending |
| Roles & Permissions | Yes | Pending full comparison | No | Pending |
| AI assistant | Navigation only / pending | No | No | Pending |
| Connections | Navigation only / pending | No | No | Pending |
| Uber Eats | Navigation only / pending | No | No | Pending |
| Deliveroo | Navigation only / pending | No | No | Pending |
| WhatsApp Assistant | Navigation only / pending | No | No | Pending |
| SMS Delivery | Navigation only / pending | No | No | Pending |
| Email Delivery | Navigation only / pending | No | No | Pending |
| Server / API Configuration | Yes | Pending parity audit | No | Superadmin/no-company access already fixed. |
| Platform / Builder | Yes | Partial | No | Approval/workflow/dashboard administration parity still needs page-level audit. |
| Message Templates | Navigation only / pending | No | No | Pending |

## Later phases

- Core workspace/object pages
- Sales / Returns
- Products / Categories
- Inventory / Replenishment / stock tools
- Purchases / Suppliers
- Customers / Loyalty / Credit / Gift cards
- Stores / Employees / Attendance
- Online Orders / Order Prep / Delivery
- Integrations / Accounting
- Reports
- Till / POS
- oneStore
- Superadmin
- Hospitality / deferred modules
- Scan & Go / Self Checkout / mobile scanner
- Audit / offline tools

This file is updated as each page completes. Every completed page is committed immediately; HOLD items are preserved and revisited after the safe migrations.
