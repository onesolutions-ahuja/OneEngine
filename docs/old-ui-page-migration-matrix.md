# Old UI → Smart Theme Migration Matrix

Zero-loss rule: an old UI page/section is deleted only after its Smart Theme replacement has equivalent routes, data, permissions, actions, fields, validation and user-visible behaviour. If business logic is uncertain, mark HOLD and move on.

## Phase 1 — Settings

| Old UI page / section | Smart Theme replacement | Logic fully migrated? | Old UI deleted? | Status / note |
|---|---|---:|---:|---|
| General | Yes | Yes | Yes | Date format, currency, timezone, Scan & Go, exchange mode, batch inventory policy migrated. Batch settings retrieval fixed. |
| Company | Yes | Yes | Yes | Company identity/contact, currency/timezone, compressed logo upload/remove, licence summary migrated. |
| Tax / VAT | Yes | Yes | Yes | VAT enabled + validated 0–100% default rate migrated. Currency remains available under General/Company. |
| Receipts | Yes | Yes | Yes | Company header, VAT display/rate, date format and Hardware paper-width guidance migrated. |
| Store & Till | Partial | No | No | HOLD — old page still owns store/till editing, invoice prefixes, negative-inventory acknowledgement, dock quick-access ordering, Customer Display runtime launch/state and one-time Self-Checkout pairing keys. |
| Client Web Shop | Yes | Yes | Yes | Full settings form, store/price-list selection, pickup/delivery, own-delivery, sandbox payments, fees/minimum order, save and public storefront link migrated. |
| Payment Terminals | Yes | Yes | Yes | Configure/add/edit terminals, masked credentials, active state and connection testing migrated. |
| Customer Loyalty | Yes | Yes | Yes | Enable/disable programme and validated 0–100% earning-rate editing migrated with the existing entitlement gate. |
| Hardware | Yes | Yes | Yes | Barcode scanner, cash drawer and receipt printer configuration, scanner test capture, paper width, active state and device-test actions migrated. |
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
