# P3 Surface Closure

- Provider sidebar Inventory resolves to `/provider/inventory`; Chain resolves to `/provider/chain`.
- Chain links to the existing Employees page and new Inventory page.
- Admin sidebar Supply Oversight resolves to `/admin/supply`. The historical `/admin/orders` redirect is preserved.
- Catalog save/status actions resolve to Supabase writes protected by RLS, validation and audit triggers.
- Adjustment and transfer confirmations resolve to authorized transactional RPCs with retry receipts.
- Low-stock preparation fills the actual purchase order form and brings it into view.
- Purchase-order actions resolve to create/transition RPCs; invalid transitions fail honestly.
- Membership forms resolve to the owner/admin-scoped delegation RPC, with a registered employee picker.
- Supply search, filtering, pagination and detail resolve to the admin-only audited query and returned order lines.
- Empty states promise no nonexistent destination. Errors have retry actions; failed mutations preserve operator input.

Source and route closure are documented. Signed-in browser closure remains unverified because this session has no available browser surface. Nothing in this file claims the automated visual audit passed.
