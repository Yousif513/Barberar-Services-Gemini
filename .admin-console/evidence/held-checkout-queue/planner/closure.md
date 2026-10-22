# Closure Report

- Depth reached: **3**
- Affordances examined: **66**
- Nodes minted: **25** (command-palette=1, drawer=1, modal=3, page=3, popover=11, state=3, toast=3)
- Holes remaining: **0**
- Ambiguous targets: **0**
- External links: 1   ·   Out of area: 6   ·   Blocked (chrome): 1

## Minted by depth

### Depth 1 — 11 node(s)

- `popover` **shared-popover-user-menu** _(shared)_ — from “User menu” on `shell`
- `drawer` **shared-drawer-notifications** _(shared)_ — from “Notifications” on `shell`
- `command-palette` **shared-command-palette-global-search** _(shared)_ — from “Search” on `shell`
- `popover` **account-sign-in-popover-date-range** — from “Date range” on `account-sign-in`
- `popover` **account-sign-in-popover-widget-actions** — from “Widget menu” on `account-sign-in`
- `popover` **customer-profile-popover-date-range** — from “Date range” on `customer-profile`
- `popover` **customer-profile-popover-widget-actions** — from “Widget menu” on `customer-profile`
- `popover` **salon-application-popover-date-range** — from “Date range” on `salon-application`
- `popover` **salon-application-popover-widget-actions** — from “Widget menu” on `salon-application`
- `popover` **salon-booking-popover-date-range** — from “Date range” on `salon-booking`
- `popover` **salon-booking-popover-widget-actions** — from “Widget menu” on `salon-booking`

### Depth 2 — 7 node(s)

- `page` **profile** — from “Profile” on `shared-popover-user-menu`
- `page` **settings** — from “Settings” on `shared-popover-user-menu`
- `state` **shared-drawer-notifications-state-empty** — from “Nothing here yet” on `shared-drawer-notifications`
- `state` **shared-drawer-notifications-state-loading** — from “Loading” on `shared-drawer-notifications`
- `toast` **shared-toast-success** _(shared)_ — from “Mark all read” on `shared-drawer-notifications`
- `page` **settings-notifications** — from “Notification settings” on `shared-drawer-notifications`
- `state` **shared-command-palette-global-search-state-no-results** — from “No results” on `shared-command-palette-global-search`

### Depth 3 — 7 node(s)

- `popover` **profile-popover-date-range** — from “Date range” on `profile`
- `popover` **profile-popover-widget-actions** — from “Widget menu” on `profile`
- `modal` **settings-modal-destructive-confirm** — from “Danger zone action” on `settings`
- `toast` **shared-toast-error** _(shared)_ — from “Error” on `settings`
- `modal` **shared-modal-reauthenticate** _(shared)_ — from “Confirm password” on `settings`
- `modal` **settings-notifications-modal-destructive-confirm** — from “Danger zone action” on `settings-notifications`
- `toast` **shared-toast-info** _(shared)_ — from “Undo” on `shared-toast-success`

## Spec statements that could not be placed

These describe real behaviour but no page matched confidently. Guessing would put a requirement on the wrong screen — review and either name the page in the spec or add the surface by hand.

- “Loading, empty and failed queries remain distinct. Guest authentication retains”
  _docs\front-end-spec.md:21_

## Out-of-area links (flagged, not generated)

- `route:/reports` — from “KPI card” on `account-sign-in`
- `route:/[id]` — from “Open full page” on `shared-drawer-notifications`
