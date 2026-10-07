import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

const checks = [
  {
    file: "web_platform/src/app/login/page.tsx",
    reject: ["mockCode", 'code !== "123456"', 'functions.invoke("send-otp"'],
  },
  {
    file: "web_platform/src/app/shop/[id]/page.tsx",
    require: ['rpc("create_booking"', 'functions.invoke("payment-checkout"'],
    reject: ['from("bookings").insert', 'from("user_packages").insert', "mock-booking-id", "Fail-safe mock redirection"],
  },
  {
    file: "mobile_app/src/components/shop-details-modal.tsx",
    require: ['rpc("create_booking"', 'functions.invoke("payment-checkout"'],
    reject: ['from("bookings").insert', 'from("user_packages").insert', "running offline update"],
  },
  {
    file: "supabase/functions/payment-checkout/index.ts",
    require: [
      '.eq("customer_id", userId)',
      "resolveCaller(req)",
      "TAP_SECRET_KEY",
      "post: { url: webhookUrl }",
    ],
    reject: ["chg_mock_", "simulated:", "Access-Control-Allow-Origin\": \"*\""],
  },
  {
    file: "supabase/functions/_shared/http.ts",
    require: ["auth.getUser(token)", "profile?.role === \"admin\""],
    reject: ["Access-Control-Allow-Origin\": \"*\""],
  },
  {
    file: "supabase/functions/process-refund/index.ts",
    require: ["resolveCaller(req)", 'caller.kind === "user"', "processRefundRequest("],
    reject: ['.update({ status: "refunded" })', 'from("bookings").update'],
  },
  {
    file: "supabase/functions/dispatch-messages/index.ts",
    require: ["graph.facebook.com", "complete_message_delivery", "externalId"],
    reject: ["wamid_", "simulated"],
  },
  {
    file: "supabase/functions/payment-webhook/index.ts",
    require: [
      "TAP_SECRET_KEY",
      "api.tap.company/v2/charges/",
      "confirm_booking_payment",
      'currency !== "SAR"',
    ],
    reject: ["x-webhook-secret"],
  },
  {
    file: "supabase/migrations/20260615182811_harden_auth_and_booking_core.sql",
    require: [
      "bookings_no_employee_overlap",
      "CREATE OR REPLACE FUNCTION public.create_booking",
      "CREATE OR REPLACE FUNCTION public.confirm_booking_payment",
      "CREATE OR REPLACE FUNCTION public.cancel_booking",
      'DROP POLICY IF EXISTS "Public read on profiles"',
      'DROP POLICY IF EXISTS "Customers create own bookings"',
    ],
    reject: ["NEW.raw_user_meta_data->>'role'"],
  },
  {
    file: "supabase/config.toml",
    require: ["[functions.payment-webhook]", "verify_jwt = false"],
  },
  {
    file: "supabase/functions/public-api/index.ts",
    require: ["handleApiRequest(", "serviceClient()"],
    reject: ["Access-Control", "corsHeaders", "OPTIONS"],
  },
  {
    file: "supabase/functions/_shared/api-router.ts",
    require: ['"authenticate_api_key"', "extractBearer(", "method_not_allowed"],
    reject: ["Access-Control", "x-api-key", 'searchParams.get("api_key")'],
  },
  {
    file: "supabase/functions/deliver-webhooks/index.ts",
    require: [
      "resolveCaller(req)",
      'caller.kind !== "service" && caller.kind !== "admin"',
      'redirect: "manual"',
      "checkResolvedAddresses(",
      "validateWebhookUrl(",
    ],
    reject: ["Access-Control", "corsHeaders", 'redirect: "follow"'],
  },
  {
    file: "supabase/config.toml",
    require: ["[functions.public-api]"],
  },
  {
    file: "supabase/functions/send-push/index.ts",
    require: ["SUPABASE_SERVICE_ROLE_KEY", 'authorization !== `Bearer ${serviceKey}`'],
  },
];

let failed = false;

for (const check of checks) {
  const contents = await read(check.file);
  for (const text of check.require ?? []) {
    if (!contents.includes(text)) {
      console.error(`Missing required security marker in ${check.file}: ${text}`);
      failed = true;
    }
  }
  for (const text of check.reject ?? []) {
    if (contents.includes(text)) {
      console.error(`Unsafe pattern found in ${check.file}: ${text}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Security core verification passed.");
