import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

const checks = [
  {
    file: "web_platform/src/app/admin/branches/page.tsx",
    require: ['from("branches")', ".update({ is_active:", "t.noBranches"],
    reject: ["14 Chairs", "Olaya Main Branch", "Corniche Suite"],
  },
  {
    file: "web_platform/src/app/admin/coupons/page.tsx",
    require: ['from("promotional_codes")', "openAddCoupon", "openEditCoupon", "deleteCoupon"],
    reject: ["RAMADAN20", "WELCOME50", "PRIMORA10", "24,320", "2,432"],
  },
  {
    file: "web_platform/src/app/admin/payments/page.tsx",
    require: ['from("payment_refund_requests")', "refundDuplicate", "ledger_id"],
    reject: ["Payment successfully refunded!", "setPayments(prev => prev.map"],
  },
  {
    file: "supabase/migrations/20260621183407_admin_branch_coupon_controls.sql",
    require: [
      "ADD COLUMN IF NOT EXISTS is_active",
      "CREATE TABLE IF NOT EXISTS public.promotional_codes",
      "CREATE TABLE IF NOT EXISTS public.payment_refund_requests",
      "ALTER TABLE public.promotional_codes ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.payment_refund_requests ENABLE ROW LEVEL SECURITY",
      "public.is_admin()",
    ],
  },
];

let failed = false;

for (const check of checks) {
  const contents = await read(check.file);
  for (const text of check.require ?? []) {
    if (!contents.includes(text)) {
      console.error(`Missing required admin-control marker in ${check.file}: ${text}`);
      failed = true;
    }
  }
  for (const text of check.reject ?? []) {
    if (contents.includes(text)) {
      console.error(`Mock-only admin-control pattern remains in ${check.file}: ${text}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Admin controls verification passed.");
