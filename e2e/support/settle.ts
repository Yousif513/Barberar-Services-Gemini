// "The screen has finished loading": no request to the app or the Supabase API is in flight and none has started for a
// short quiet period. It is measured from the page's own network events and polled, never a fixed wait.

import { expect, type Page } from "@playwright/test";

export function trackNetwork(page: Page): () => Promise<void> {
  let inFlight = 0;
  let lastActivity = Date.now();
  const relevant = (url: string) => !url.startsWith("data:") && !url.includes("/_next/webpack-hmr") && !url.includes("__nextjs");
  page.on("request", (request) => { if (relevant(request.url())) { inFlight += 1; lastActivity = Date.now(); } });
  const done = (url: string) => { if (relevant(url)) { inFlight = Math.max(0, inFlight - 1); lastActivity = Date.now(); } };
  page.on("requestfinished", (request) => done(request.url()));
  page.on("requestfailed", (request) => done(request.url()));
  return async (quietMs = 1_000) => {
    await expect.poll(() => inFlight === 0 && Date.now() - lastActivity >= quietMs, {
      message: "the page to finish its requests", timeout: 60_000, intervals: [100, 250, 500],
    }).toBe(true);
  };
}
