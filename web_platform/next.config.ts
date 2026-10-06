import type { NextConfig } from "next";
import path from "node:path";

// Old admin addresses that now lead to the screen that took over their job. They redirect on the server, so
// nobody waits on a spinner page that navigates from the browser.
const adminRedirects = [
      { source: "/admin/analytics", destination: "/admin/reports", permanent: false },
      { source: "/admin/commissions", destination: "/admin/taxes", permanent: false },
      { source: "/admin/locations", destination: "/admin/branches", permanent: false },
      { source: "/admin/orders", destination: "/admin/bookings", permanent: false },
      { source: "/admin/payments", destination: "/admin/ledger", permanent: false },
      { source: "/admin/roles", destination: "/admin/employees", permanent: false },
      { source: "/admin/rooms", destination: "/admin/branches", permanent: false },
      { source: "/admin/system-logs", destination: "/admin/audit-logs", permanent: false },
      { source: "/admin/teams", destination: "/admin/employees", permanent: false },
      { source: "/admin/webhooks", destination: "/admin/audit-logs", permanent: false },
];

// Browser protections that need no per-page tuning: no MIME sniffing, no framing of any page (clickjacking on the
// admin console), a trimmed Referer, HTTPS only, and no camera or microphone (the app uses neither). A
// Content-Security-Policy is deliberately not set here: it needs a tested list of every script, style and
// payment origin the pages load, and an untested one would break checkout.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async redirects() {
    return adminRedirects;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
