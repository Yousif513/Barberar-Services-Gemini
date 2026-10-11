// Tabs, status filters and search terms live in the address bar, so a view can be bookmarked, pasted into an incident
// channel, restored on reload and linked to from the dashboard. Screens read the query string once, when they open,
// and write it back as the operator changes a filter (replacing the history entry, so Back still leaves the screen).

export function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// An empty value removes the parameter, so the default view keeps a clean address.
export function writeUrlState(values: Record<string, string>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}
