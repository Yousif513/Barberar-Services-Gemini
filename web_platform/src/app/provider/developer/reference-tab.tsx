"use client";

import React from "react";
import { OperationsPanel, type OperationsLocale } from "@/components/operations-ui";
import {
  API_SCOPES, BOOKING_STATUSES, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, DELIVERY_TIMEOUT_SECONDS, SIGNATURE_TOLERANCE_SECONDS, WEBHOOK_EVENTS,
  type ApiScope,
} from "@/lib/developer-api";
import type { DeveloperCopy } from "./copy";
import { CodeBlock } from "./shared";

type EndpointDoc = { path: string; scope: ApiScope; params: Array<[string, string]>; response: string };

const ENDPOINTS: EndpointDoc[] = [
  {
    path: "/v1/services",
    scope: "services:read",
    params: [["limit", `1-${PAGE_SIZE_MAX}, default ${PAGE_SIZE_DEFAULT}`], ["cursor", "next_cursor of the previous page"]],
    response: `{
  "data": [
    { "id": "<uuid>", "name_en": "…", "name_ar": "…", "description_en": "…", "description_ar": "…",
      "category_id": "<uuid>", "price": 150, "currency": "SAR", "duration_minutes": 45,
      "is_home_service_eligible": false, "is_active": true, "created_at": "…", "updated_at": "…" }
  ],
  "pagination": { "limit": ${PAGE_SIZE_DEFAULT}, "has_more": false, "next_cursor": null }
}`,
  },
  {
    path: "/v1/employees",
    scope: "employees:read",
    params: [["limit", `1-${PAGE_SIZE_MAX}, default ${PAGE_SIZE_DEFAULT}`], ["cursor", "next_cursor of the previous page"]],
    response: `{
  "data": [
    { "id": "<uuid>", "branch_id": "<uuid>", "name_en": "…", "name_ar": "…", "title_en": "…", "title_ar": "…",
      "is_active": true, "service_ids": ["<uuid>"] }
  ],
  "pagination": { "limit": ${PAGE_SIZE_DEFAULT}, "has_more": false, "next_cursor": null }
}`,
  },
  {
    path: "/v1/availability",
    scope: "availability:read",
    params: [["service_id", "required, UUID of one of your services"], ["date", "required, YYYY-MM-DD (Riyadh calendar day)"]],
    response: `{
  "data": [
    { "employee_id": "<uuid>", "branch_id": "<uuid>", "service_id": "<uuid>", "date": "2026-10-07",
      "slots": [ { "start": "2026-10-07T06:00:00+00:00", "end": "2026-10-07T06:45:00+00:00" } ] }
  ]
}`,
  },
  {
    path: "/v1/bookings",
    scope: "bookings:read",
    params: [
      ["from", "date or timestamp with offset, inclusive"], ["to", "date or timestamp with offset, exclusive"],
      ["status", BOOKING_STATUSES.join(" | ")], ["limit", `1-${PAGE_SIZE_MAX}, default ${PAGE_SIZE_DEFAULT}`], ["cursor", "next_cursor of the previous page"],
    ],
    response: `{
  "data": [
    { "id": "<uuid>", "status": "confirmed", "scheduled_at": "2026-10-07T06:00:00+00:00", "duration_minutes": 45,
      "branch_id": "<uuid>", "employee_id": "<uuid>", "service_id": "<uuid>", "service_name_en": "…", "service_name_ar": "…",
      "is_home_service": false, "source": "link", "total_price": 150, "tax_amount": 19.57, "discount_amount": 0,
      "currency": "SAR", "created_at": "…" }
  ],
  "pagination": { "limit": ${PAGE_SIZE_DEFAULT}, "has_more": true, "next_cursor": "<opaque>" }
}`,
  },
];

const ERROR_SAMPLE = `{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit of 60 requests per minute exceeded. Retry in 12 seconds.",
    "request_id": "req_0123456789abcdef0123456789abcdef"
  }
}`;

const EVENT_SAMPLE = `{
  "id": "<event uuid, stable for this booking and event type>",
  "type": "booking.confirmed",
  "api_version": "v1",
  "created_at": "2026-10-07T06:00:00+00:00",
  "data": { "booking": { "id": "<uuid>", "status": "confirmed", "scheduled_at": "…", "duration_minutes": 45,
                         "branch_id": "<uuid>", "employee_id": "<uuid>", "service_id": "<uuid>",
                         "service_name_en": "…", "service_name_ar": "…", "total_price": 150, "currency": "SAR" } }
}`;

const VERIFY_SAMPLE = `import { createHmac, timingSafeEqual } from "node:crypto";

// secret: the signing secret shown once when you created the endpoint (starts with whsec_)
// header: the X-Primora-Signature header   rawBody: the request body exactly as received
function verify(secret, header, rawBody, toleranceSeconds = ${SIGNATURE_TOLERANCE_SECONDS}) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));   // { t, v1 }
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}`;

export function ReferenceTab({ locale, t }: { locale: OperationsLocale; t: DeveloperCopy }) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const base = configured ? `${configured}/functions/v1/public-api` : null;
  const shownBase = base ?? `<${t.refBaseUnset}>/functions/v1/public-api`;
  const curl = `curl "${shownBase}/v1/bookings?from=2026-10-01&to=2026-11-01&status=confirmed&limit=50" \\\n  -H "Authorization: Bearer $PRIMORA_API_KEY"`;
  const node = `const res = await fetch("${shownBase}/v1/bookings?limit=50", {\n  headers: { Authorization: \`Bearer \${process.env.PRIMORA_API_KEY}\` },\n});\nconst { data, pagination } = await res.json();   // pagination.next_cursor → ?cursor=…`;
  void locale;

  return (
    <div className="space-y-6">
      <OperationsPanel title={t.refTitle}>
        <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.refIntro}</p>
        <h3 className="mt-5 text-sm font-black text-[#101828]">{t.refBase}</h3>
        <p dir="ltr" className="mt-1 break-all text-start font-mono text-xs text-[#344054]">{shownBase}</p>
        <h3 className="mt-5 text-sm font-black text-[#101828]">{t.refAuth}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#475467]">{t.refAuthBody}</p>
        <CodeBlock code={curl} label={`${t.refExample} · curl`} copyLabel={t.copyCode} />
        <CodeBlock code={node} label={`${t.refExample} · Node.js`} copyLabel={t.copyCode} />
        <p className="mt-4 max-w-3xl text-sm leading-6 text-[#475467]">{t.refListNote}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#475467]">{t.refDates}</p>
      </OperationsPanel>

      <OperationsPanel title={t.refEndpoints}>
        <div className="space-y-6">
          {ENDPOINTS.map((endpoint) => (
            <section key={endpoint.path} aria-labelledby={`ref-${endpoint.scope}`}>
              <h3 id={`ref-${endpoint.scope}`} className="flex flex-wrap items-center gap-2 text-sm font-black text-[#101828]">
                <bdi dir="ltr" className="rounded bg-[#101828] px-2 py-1 font-mono text-xs text-white">GET {endpoint.path}</bdi>
                <span className="text-xs font-semibold text-[#667085]">{t.refScopeNeeded}: <bdi dir="ltr" className="font-mono">{endpoint.scope}</bdi> · {t.scope[endpoint.scope]}</span>
              </h3>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {endpoint.params.map(([name, description]) => (
                  <div key={name} className="contents"><dt dir="ltr" className="font-mono font-bold text-[#101828]">{name}</dt><dd dir="ltr" className="text-start text-[#475467]">{description}</dd></div>
                ))}
              </dl>
              <CodeBlock code={endpoint.response} label={t.refResponse} copyLabel={t.copyCode} />
            </section>
          ))}
          <p className="text-xs text-[#667085]">{API_SCOPES.length} scopes · {t.refPrivacy}: {t.refPrivacyBody}</p>
        </div>
      </OperationsPanel>

      <OperationsPanel title={t.refErrors}>
        <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.refErrorsBody}</p>
        <CodeBlock code={ERROR_SAMPLE} label={t.refErrors} copyLabel={t.copyCode} />
        <h3 className="mt-5 text-sm font-black text-[#101828]">{t.refStatuses}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-start text-sm">
            <caption className="sr-only">{t.refStatuses}</caption>
            <tbody>
              {t.refStatusRows.map(([status, code, description]) => (
                <tr key={status} className="border-b border-[#F2F4F7] align-top">
                  <th scope="row" className="px-2 py-2 text-start font-mono text-xs font-bold" dir="ltr">{status}</th>
                  <td className="px-2 py-2 font-mono text-xs" dir="ltr">{code}</td>
                  <td className="px-2 py-2 text-[#475467]">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-5 text-sm font-black text-[#101828]">{t.refRate}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#475467]">{t.refRateBody}</p>
      </OperationsPanel>

      <OperationsPanel title={t.refWebhooks}>
        <p className="max-w-3xl text-sm leading-6 text-[#475467]">{t.refWebhooksBody.replace("{n}", String(DELIVERY_TIMEOUT_SECONDS))}</p>
        <h3 className="mt-4 text-sm font-black text-[#101828]">{t.refEvents}</h3>
        <ul className="mt-2 space-y-1 text-sm text-[#475467]">
          {WEBHOOK_EVENTS.map((event) => <li key={event}><bdi dir="ltr" className="rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-xs">{event}</bdi><span className="ms-2">{t.eventHelp[event]}</span></li>)}
        </ul>
        <CodeBlock code={EVENT_SAMPLE} label={t.refPayload} copyLabel={t.copyCode} />
        <h3 className="mt-5 text-sm font-black text-[#101828]">{t.refSignature}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#475467]">{t.refSignatureBody.replace("{n}", String(SIGNATURE_TOLERANCE_SECONDS))}</p>
        <CodeBlock code={VERIFY_SAMPLE} label={`${t.refSignature} · Node.js`} copyLabel={t.copyCode} />
      </OperationsPanel>
    </div>
  );
}
